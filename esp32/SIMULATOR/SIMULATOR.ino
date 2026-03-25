// =============================================================
// SIMULATOR.ino  –  Kommissionierautomat State Machine Simulator
// =============================================================
//
// ESP8266 (Wemos D1 mini) und ESP32.
//
// Ersetzt die komplette Hardware (Servos, Sensoren, LCD, LEDs,
// Button, Piezo, MUX) durch reine Software-Simulation.
// WiFi-AP und HTTP-Server laufen auf dem Chip, damit die
// NestJS-API direkt damit kommunizieren kann.
//
// Steuerung über Serial-Monitor (115200 Baud):
//   status   → Detailansicht des aktuellen Zustands
//   btn      → Button-Druck simulieren (für manuelle Bestätigung)
//   help     → Befehlsübersicht
//
// Arduino IDE: Board "LOLIN(WEMOS) D1 R2 & mini" (ESP8266) oder
// passendes ESP32-Board; Bibliothek ArduinoJson installieren.
//
// =============================================================

#if defined(ESP8266)
#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
ESP8266WebServer server(80);
#elif defined(ESP32)
#include <WiFi.h>
#include <WebServer.h>
WebServer server(80);
#else
#error "Nur ESP8266 oder ESP32 unterstuetzt."
#endif

#include <ArduinoJson.h>

// =========================================================
// Netzwerk  (identisch zu FINAL.ino)
// =========================================================
static const char* AP_SSID = "Kommisionierautomat";
static const char* AP_PASS = "DCPS-WiSe2526";

IPAddress apIP(192, 168, 178, 1);
IPAddress apGW(192, 168, 178, 1);
IPAddress apSN(255, 255, 255, 0);

// =========================================================
// Systemparameter
// =========================================================
static const int PART_COUNT  = 5;
static const int ACTIVE_PARTS = 5;

// =========================================================
// Simulations-Timing
// =========================================================
const unsigned long SIM_DISPENSE_INTERVAL_MS  = 400;
const unsigned long SIM_CALIB_DURATION_MS     = 500;

// Nach dieser Zeit im FINISHED-Zustand wird automatisch ein
// Button-Druck simuliert (Kunde hat Teile entnommen).
// 0 = deaktiviert (manuell per Serial "btn").
const unsigned long SIM_AUTO_PICKUP_DELAY_MS  = 10000;  // 10 Sekunden

// =========================================================
// Magazinkapazitäten
// =========================================================
const int simMagazineCapacity[PART_COUNT] = { 17, 17, 17, 17, 17 };
int       simMagazineRemaining[PART_COUNT];

unsigned long simLastDispenseMs = 0;
unsigned long simCalibStartMs   = 0;

static bool          simBtnEdgePending  = false;
static unsigned long simFinishedEnteredMs = 0;   // Zeitstempel, wann FINISHED betreten wurde

// =========================================================
// Zustände  (identisch zu FINAL.ino)
// =========================================================
enum RunState {
  STARTUP_CALIBRATION,
  NO_CLIENT,
  WAIT_ORDER,
  CALIBRATING,
  DISPENSING,
  MAG_CHANGE,
  MAG_INSERT_CONFIRM,
  FINISHED
};

RunState state = STARTUP_CALIBRATION;

// =========================================================
// Laufdaten
// =========================================================
int      ausgabeWerte[PART_COUNT]    = { 0, 0, 0, 0, 0 };
uint32_t targetCount[PART_COUNT]     = { 0, 0, 0, 0, 0 };
uint32_t totalCount[PART_COUNT]      = { 0, 0, 0, 0, 0 };
uint8_t  magazinWechseln[PART_COUNT] = { 0, 0, 0, 0, 0 };

bool partCalibrated[PART_COUNT] = { false, false, false, false, false };

volatile bool orderPending = false;
int currentPart     = -1;
int calibrationPart = -1;

bool waitingForInsertConfirmationAfterCalibration = false;

String firstStaMacCache = "";

static int  statusLatch            = -1;
static bool finishedLatchedThisCycle = false;

String serialLineBuffer;

// =========================================================
// Status → Binärcode  (identisch zu FINAL.ino)
// =========================================================
static const char* stateToStatusCodeBin(RunState s) {
  switch (s) {
    case STARTUP_CALIBRATION: return "0101";
    case NO_CLIENT:           return "0000";
    case WAIT_ORDER:          return "0001";
    case DISPENSING:          return "0010";
    case FINISHED:            return "0011";
    case MAG_CHANGE:          return "0100";
    case MAG_INSERT_CONFIRM:  return "0100";
    case CALIBRATING:         return "0101";
    default:                  return "0000";
  }
}

static uint8_t stateToStatusCodeNum(RunState s) {
  switch (s) {
    case NO_CLIENT:           return 0;
    case WAIT_ORDER:          return 1;
    case DISPENSING:          return 2;
    case FINISHED:            return 3;
    case MAG_CHANGE:
    case MAG_INSERT_CONFIRM:  return 4;
    case STARTUP_CALIBRATION:
    case CALIBRATING:         return 5;
    default:                  return 0;
  }
}

// =========================================================
// Debug-Ausgabe (ersetzt LCD)
// =========================================================
static String lastPrintedStatus = "";

static const char* stateToName(RunState s) {
  switch (s) {
    case STARTUP_CALIBRATION: return "STARTUP_CALIB";
    case NO_CLIENT:           return "NO_CLIENT";
    case WAIT_ORDER:          return "WAIT_ORDER";
    case CALIBRATING:         return "CALIBRATING";
    case DISPENSING:          return "DISPENSING";
    case MAG_CHANGE:          return "MAG_CHANGE";
    case MAG_INSERT_CONFIRM:  return "MAG_INSERT_CONFIRM";
    case FINISHED:            return "FINISHED";
    default:                  return "UNKNOWN";
  }
}

static void printSimStatus() {
  String line = "[SIM] ";
  line += stateToName(state);
  line += " (";
  line += stateToStatusCodeBin(state);
  line += ")";
  if (currentPart >= 0) {
    line += "  T";
    line += (currentPart + 1);
    line += ": ";
    line += totalCount[currentPart];
    line += "/";
    line += targetCount[currentPart];
    line += "  mag=";
    line += simMagazineRemaining[currentPart];
    line += "/";
    line += simMagazineCapacity[currentPart];
  }
  for (int i = 0; i < PART_COUNT; i++) {
    if (magazinWechseln[i]) {
      line += "  ! WECHSELN_";
      line += (i + 1);
    }
  }
  if (line != lastPrintedStatus) {
    Serial.println(line);
    lastPrintedStatus = line;
  }
}

// =========================================================
// Helfer
// =========================================================
static uint32_t sumTotalCount() {
  uint32_t s = 0;
  for (int i = 0; i < ACTIVE_PARTS; i++) s += totalCount[i];
  return s;
}

static void resetOrderCounters() {
  for (int i = 0; i < ACTIVE_PARTS; i++) totalCount[i] = 0;
}

static int findNextPart(int startIdx) {
  for (int i = startIdx; i < ACTIVE_PARTS; i++) {
    if (targetCount[i] > 0) return i;
  }
  return -1;
}

/** JSON-POST-Body (NestJS/axios: application/json) – ESP8266/ESP32 */
static String readPostBody() {
  String body;
  if (server.hasArg("plain")) {
    body = server.arg("plain");
  }
  if (body.length() > 0) return body;

#if defined(ESP8266)
  // Manche Clients: Rohdaten als einziges Argument
  for (uint8_t i = 0; i < server.args(); i++) {
    String n = server.argName(i);
    if (n.length() == 0 || n == "plain") {
      body = server.arg(i);
      if (body.length() > 0) return body;
    }
  }
#endif
  return body;
}

static bool requireKeyInt(JsonObject obj, const char* key, int& outVal) {
  if (!obj.containsKey(key)) return false;
  JsonVariant x = obj[key];
  if (!x.is<int>() && !x.is<long>() && !x.is<float>() && !x.is<double>()) return false;
  outVal = (int)x.as<long>();
  return true;
}

// =========================================================
// Simulation: Kalibrierung
// =========================================================
static void startCalibrationForPart(int partIdx) {
  if (partIdx < 0 || partIdx >= ACTIVE_PARTS) return;
  calibrationPart = partIdx;
  simCalibStartMs = millis();
  Serial.printf("[SIM] Kalibrierung gestartet: Teil %d  (Dauer: %lums)\n",
                partIdx + 1, SIM_CALIB_DURATION_MS);
}

static void checkCalibrationComplete(unsigned long now) {
  if (calibrationPart < 0 || calibrationPart >= ACTIVE_PARTS) return;
  if (partCalibrated[calibrationPart]) return;
  if (now - simCalibStartMs < SIM_CALIB_DURATION_MS) return;

  partCalibrated[calibrationPart] = true;
  Serial.printf("[SIM] Kalibrierung abgeschlossen: Teil %d\n", calibrationPart + 1);

  if (waitingForInsertConfirmationAfterCalibration) {
    simMagazineRemaining[calibrationPart] = simMagazineCapacity[calibrationPart];
    Serial.printf("[SIM] Magazin %d aufgefuellt auf %d Teile\n",
                  calibrationPart + 1, simMagazineCapacity[calibrationPart]);
  }
}

// =========================================================
// Ablaufsteuerung
// =========================================================
static void enterMagChangeForCurrentPart() {
  if (currentPart < 0 || currentPart >= ACTIVE_PARTS) return;

  magazinWechseln[currentPart] = 1;
  partCalibrated[currentPart]  = false;
  waitingForInsertConfirmationAfterCalibration = false;

  state = MAG_CHANGE;
  Serial.printf("\n[SIM] *** MAGAZINWECHSEL erforderlich: Teil %d (Magazin leer) ***\n\n",
                currentPart + 1);
}

static void startMagazineChangeCalibration() {
  if (currentPart < 0 || currentPart >= ACTIVE_PARTS) return;
  waitingForInsertConfirmationAfterCalibration = true;
  state = CALIBRATING;
  startCalibrationForPart(currentPart);
}

static void confirmNewMagazineInsertedAndResume() {
  if (currentPart < 0 || currentPart >= ACTIVE_PARTS) return;

  int part = currentPart;
  magazinWechseln[part] = 0;
  waitingForInsertConfirmationAfterCalibration = false;
  currentPart = -1;
  state = WAIT_ORDER;

  Serial.printf("[SIM] Magazin %d bestaetigt eingesetzt -> WAIT_ORDER\n", part + 1);
}

static void startDispensingForCurrentPart() {
  if (currentPart < 0 || currentPart >= ACTIVE_PARTS) return;
  simLastDispenseMs = millis();
  state = DISPENSING;
  Serial.printf("[SIM] Ausgabe Teil %d: Ziel=%d  Magazin=%d/%d\n",
                currentPart + 1, targetCount[currentPart],
                simMagazineRemaining[currentPart], simMagazineCapacity[currentPart]);
}

// =========================================================
// JSON / API
// =========================================================
static void sendJson(int code, const JsonDocument& doc) {
  String out;
  serializeJson(doc, out);
  server.send(code, "application/json", out);
}

static void buildStatusJson(JsonDocument& resp) {
  for (int i = 0; i < PART_COUNT; i++) {
    String key = "antwort_wert" + String(i + 1);
    resp[key] = (int)totalCount[i];
  }

  resp["magazin1_wechseln"] = magazinWechseln[0];
  resp["magazin2_wechseln"] = magazinWechseln[1];
  resp["magazin3_wechseln"] = magazinWechseln[2];
  resp["magazin4_wechseln"] = magazinWechseln[3];
  resp["magazin5_wechseln"] = magazinWechseln[4];

  resp["system_zeit"]   = (uint32_t)millis();
  resp["status"]        = statusLatch;
  resp["status_bin"]    = stateToStatusCodeBin(state);
  resp["aktuelles_teil"] = currentPart + 1;
  resp["warte_auf_magazin_einsetzen"] = (state == MAG_INSERT_CONFIRM) ? 1 : 0;

  bool allCalibrated = true;
  for (int i = 0; i < PART_COUNT; i++) {
    if (!partCalibrated[i]) { allCalibrated = false; break; }
  }
  resp["kalibriert"] = allCalibrated ? 1 : 0;

  for (int i = 0; i < PART_COUNT; i++) {
    String key = "sim_mag" + String(i + 1);
    resp[key] = simMagazineRemaining[i];
  }
}

static void sendStatusAndConsume() {
  StaticJsonDocument<1024> resp;
  buildStatusJson(resp);
  sendJson(200, resp);
  if (statusLatch != -1) statusLatch = -1;
}

void handleRoot() {
  String msg = "SIMULATOR - Kommissionierautomat\n";
  msg += "POST /setAusgabe          {wert1..wert5}\n";
  msg += "GET  /status\n";
  msg += "POST /magazinwechsel      {magazin1_gewechselt..magazin5_gewechselt}\n";
  msg += "POST /magazinwechsel/start  (MAG_CHANGE) oder {part:N} (WAIT_ORDER)\n";
  msg += "POST /data\n";
  server.send(200, "text/plain", msg);
}

void handleStatus() {
  if (server.method() != HTTP_GET) {
    server.send(405, "text/plain", "Method Not Allowed");
    return;
  }
  sendStatusAndConsume();
}

void handleData() {
  if (server.method() != HTTP_POST) {
    server.send(405, "text/plain", "Method Not Allowed");
    return;
  }
  sendStatusAndConsume();
}

void handleMagazinwechsel() {
  if (server.method() != HTTP_POST) {
    server.send(405, "text/plain", "Method Not Allowed");
    return;
  }
  String raw = readPostBody();
  if (raw.length() == 0) {
    server.send(400, "text/plain", "Bad Request: missing body");
    return;
  }

  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, raw);
  if (err) {
    server.send(400, "text/plain", "Bad Request: invalid JSON");
    return;
  }

  JsonObject o = doc.as<JsonObject>();
  int changed[PART_COUNT] = { 0, 0, 0, 0, 0 };
  bool ok =
    requireKeyInt(o, "magazin1_gewechselt", changed[0]) &&
    requireKeyInt(o, "magazin2_gewechselt", changed[1]) &&
    requireKeyInt(o, "magazin3_gewechselt", changed[2]) &&
    requireKeyInt(o, "magazin4_gewechselt", changed[3]) &&
    requireKeyInt(o, "magazin5_gewechselt", changed[4]);

  if (!ok) {
    server.send(400, "text/plain",
                "Bad Request: expected keys magazin1_gewechselt..magazin5_gewechselt");
    return;
  }

  if (currentPart >= 0 && currentPart < PART_COUNT && changed[currentPart] == 1) {
    if (state == MAG_CHANGE) {
      startMagazineChangeCalibration();
    } else if (state == MAG_INSERT_CONFIRM) {
      confirmNewMagazineInsertedAndResume();
    }
  }

  StaticJsonDocument<1024> resp;
  buildStatusJson(resp);
  sendJson(200, resp);
}

// Start the magazine change calibration (equivalent to physical start button).
// Also accepts WAIT_ORDER with a "part" body parameter to force a change from idle.
void handleMagazinwechselStart() {
  if (server.method() != HTTP_POST) {
    server.send(405, "text/plain", "Method Not Allowed");
    return;
  }

  if (state == WAIT_ORDER) {
    // Force magazine change from idle: requires "part" (1-based) in JSON body
    String raw = readPostBody();
    if (raw.length() == 0) {
      server.send(400, "text/plain", "Bad Request: missing body");
      return;
    }
    StaticJsonDocument<64> doc;
    DeserializationError err = deserializeJson(doc, raw);
    if (err) {
      server.send(400, "text/plain", "Bad Request: invalid JSON");
      return;
    }
    JsonObject o = doc.as<JsonObject>();
    int part;
    if (!requireKeyInt(o, "part", part) || part < 1 || part > PART_COUNT) {
      server.send(400, "text/plain", "Bad Request: expected 'part' (1..PART_COUNT)");
      return;
    }
    currentPart = part - 1;
    enterMagChangeForCurrentPart();
    startMagazineChangeCalibration();
    Serial.printf("[SIM] Force-Magazinwechsel Teil %d gestartet\n", part);
    server.send(200, "text/plain", "OK");
    return;
  }

  if (state != MAG_CHANGE) {
    server.send(409, "text/plain", "MC not in MAG_CHANGE or WAIT_ORDER");
    return;
  }

  if (currentPart < 0 || currentPart >= PART_COUNT) {
    server.send(400, "text/plain", "No active part selected");
    return;
  }

  Serial.println(F("[SIM] /magazinwechsel/start -> startMagazineChangeCalibration"));
  startMagazineChangeCalibration();
  server.send(200, "text/plain", "OK");
}

void handleSetAusgabe() {
  if (server.method() != HTTP_POST) {
    server.send(405, "text/plain", "Method Not Allowed");
    return;
  }
  String raw = readPostBody();
  if (raw.length() == 0) {
    server.send(400, "text/plain", "Bad Request: missing body");
    return;
  }

  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, raw);
  if (err) {
    server.send(400, "text/plain", "Bad Request: invalid JSON");
    return;
  }

  JsonObject o = doc.as<JsonObject>();
  int w[PART_COUNT];
  bool ok =
    requireKeyInt(o, "wert1", w[0]) &&
    requireKeyInt(o, "wert2", w[1]) &&
    requireKeyInt(o, "wert3", w[2]) &&
    requireKeyInt(o, "wert4", w[3]) &&
    requireKeyInt(o, "wert5", w[4]);

  if (!ok) {
    server.send(400, "text/plain", "Bad Request: expected keys wert1..wert5 with numeric values");
    return;
  }

  if (o.size() != 5) {
    server.send(400, "text/plain", "Bad Request: must contain exactly 5 values");
    return;
  }

  for (int i = 0; i < PART_COUNT; i++) {
    ausgabeWerte[i] = w[i];
    targetCount[i]  = (w[i] < 0) ? 0 : (uint32_t)w[i];
  }

  orderPending = true;
  statusLatch  = -1;
  finishedLatchedThisCycle = false;

  Serial.printf("[SIM] /setAusgabe: wert1=%d wert2=%d wert3=%d wert4=%d wert5=%d\n",
                w[0], w[1], w[2], w[3], w[4]);

  StaticJsonDocument<192> resp;
  resp["status"]  = "ok";
  resp["message"] = "received";
  JsonArray values = resp.createNestedArray("values");
  for (int i = 0; i < PART_COUNT; i++) values.add(ausgabeWerte[i]);
  sendJson(200, resp);
}

// =========================================================
// Serial-Kommandos
// =========================================================
static void printHelp() {
  Serial.println(F("\n=== SIMULATOR Befehle ==="));
  Serial.println(F("  status   Detaillierter Zustand aller Teile"));
  Serial.println(F("  btn      Button-Druck simulieren"));
  Serial.println(F("  help     Diese Hilfe"));
  Serial.println(F("=========================\n"));
}

static void printFullStatus() {
  Serial.printf("\n--- Zustand: %s  bin=%s  statusLatch=%d ---\n",
                stateToName(state), stateToStatusCodeBin(state), statusLatch);
  Serial.printf("    currentPart=%d  calibrationPart=%d  waitInsertConfirm=%d\n",
                currentPart, calibrationPart,
                waitingForInsertConfirmationAfterCalibration ? 1 : 0);
  for (int i = 0; i < PART_COUNT; i++) {
    Serial.printf("    Teil %d: target=%d  total=%d  mag=%d/%d  wechseln=%d  calibrated=%d\n",
                  i + 1,
                  targetCount[i], totalCount[i],
                  simMagazineRemaining[i], simMagazineCapacity[i],
                  magazinWechseln[i],
                  partCalibrated[i] ? 1 : 0);
  }
  Serial.println();
}

static void handleSerialCommand(String line) {
  line.trim();
  if (line.length() == 0) return;
  line.toLowerCase();

  if (line == "help") {
    printHelp();
  } else if (line == "status") {
    printFullStatus();
  } else if (line == "btn") {
    simBtnEdgePending    = true;
    simFinishedEnteredMs = 0;  // Timer zurücksetzen bei manuellem Druck
    Serial.println(F("[SIM] Button-Druck gesetzt"));
  } else {
    Serial.printf("[SIM] Unbekannter Befehl: %s\n", line.c_str());
    printHelp();
  }
}

static void processSerialInput() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      handleSerialCommand(serialLineBuffer);
      serialLineBuffer = "";
    } else {
      serialLineBuffer += c;
      if (serialLineBuffer.length() > 100) {
        serialLineBuffer = "";
        Serial.println(F("[SIM] Eingabe zu lang, verworfen"));
      }
    }
  }
}

// =========================================================
// SETUP
// =========================================================
void setup() {
  Serial.begin(115200);
  delay(200);

  for (int i = 0; i < PART_COUNT; i++) {
    simMagazineRemaining[i] = simMagazineCapacity[i];
  }

  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(apIP, apGW, apSN);
  WiFi.softAP(AP_SSID, AP_PASS);

  server.on("/",               HTTP_GET,  handleRoot);
  server.on("/setAusgabe",     HTTP_POST, handleSetAusgabe);
  server.on("/status",         HTTP_GET,  handleStatus);
  server.on("/magazinwechsel",       HTTP_POST, handleMagazinwechsel);
  server.on("/magazinwechsel/start", HTTP_POST, handleMagazinwechselStart);
  server.on("/data",                 HTTP_POST, handleData);
  server.begin();

  Serial.println(F("\n========================================="));
  Serial.println(F("  Kommissionierautomat  S I M U L A T O R"));
#if defined(ESP8266)
  Serial.println(F("  (ESP8266 / Wemos D1 mini)"));
#else
  Serial.println(F("  (ESP32)"));
#endif
  Serial.println(F("========================================="));
  Serial.printf("  AP:   SSID=%s\n", AP_SSID);
  Serial.println(F("  IP:   192.168.178.1"));
  Serial.println(F("  Magazinkapazitaeten:"));
  for (int i = 0; i < PART_COUNT; i++) {
    Serial.printf("    Teil %d: %d Plaetze%s\n",
                  i + 1, simMagazineCapacity[i],
                  (simMagazineCapacity[i] == 2) ? "  <- klein -> Magazinwechsel" : "");
  }
  Serial.println(F("=========================================\n"));
  printHelp();

  currentPart     = -1;
  calibrationPart = 0;
  waitingForInsertConfirmationAfterCalibration = false;
  state = STARTUP_CALIBRATION;
  startCalibrationForPart(calibrationPart);

  statusLatch            = -1;
  finishedLatchedThisCycle = false;
}

// =========================================================
// LOOP
// =========================================================
void loop() {
  const unsigned long now = millis();

  server.handleClient();
#if defined(ESP8266)
  yield();
#endif
  processSerialInput();

  bool btnPressedEdge = simBtnEdgePending;
  simBtnEdgePending   = false;

  int stations = WiFi.softAPgetStationNum();
  if (stations > 0) firstStaMacCache = "sim-client";

  printSimStatus();

  switch (state) {

    case STARTUP_CALIBRATION:
    {
      checkCalibrationComplete(now);

      if (calibrationPart >= 0 && partCalibrated[calibrationPart]) {
        int next = -1;
        for (int i = calibrationPart + 1; i < ACTIVE_PARTS; i++) {
          if (!partCalibrated[i]) { next = i; break; }
        }
        if (next >= 0) {
          calibrationPart = next;
          startCalibrationForPart(calibrationPart);
        } else {
          calibrationPart = -1;
          state = (stations > 0) ? WAIT_ORDER : NO_CLIENT;
          Serial.println(F("[SIM] Startup-Kalibrierung fertig -> bereit"));
        }
      }
    }
    break;

    case NO_CLIENT:
    {
      statusLatch = -1;
      finishedLatchedThisCycle = false;
      if (stations > 0) {
        state = WAIT_ORDER;
        Serial.println(F("[SIM] Client verbunden -> WAIT_ORDER"));
      }
    }
    break;

    case WAIT_ORDER:
    {
      if (stations <= 0) {
        state = NO_CLIENT;
        break;
      }

      statusLatch = -1;
      finishedLatchedThisCycle = false;

      if (orderPending) {
        orderPending = false;
        waitingForInsertConfirmationAfterCalibration = false;

        resetOrderCounters();
        for (int i = 0; i < PART_COUNT; i++) magazinWechseln[i] = 0;

        currentPart = findNextPart(0);
        if (currentPart < 0) {
          state = FINISHED;
          break;
        }

        if (!partCalibrated[currentPart]) {
          state = CALIBRATING;
          waitingForInsertConfirmationAfterCalibration = false;
          startCalibrationForPart(currentPart);
        } else {
          startDispensingForCurrentPart();
        }
      }
    }
    break;

    case CALIBRATING:
    {
      statusLatch = -1;
      finishedLatchedThisCycle = false;

      checkCalibrationComplete(now);

      if (calibrationPart >= 0 && partCalibrated[calibrationPart]) {
        calibrationPart = -1;

        if (waitingForInsertConfirmationAfterCalibration) {
          state = MAG_INSERT_CONFIRM;
          Serial.printf("[SIM] -> MAG_INSERT_CONFIRM (Teil %d)\n",
                        currentPart + 1);
        } else {
          startDispensingForCurrentPart();
        }
      }
    }
    break;

    case DISPENSING:
    {
      statusLatch = -1;
      finishedLatchedThisCycle = false;

      if (now - simLastDispenseMs >= SIM_DISPENSE_INTERVAL_MS) {
        simLastDispenseMs = now;

        if (simMagazineRemaining[currentPart] > 0) {
          totalCount[currentPart]++;
          simMagazineRemaining[currentPart]--;
          Serial.printf("[SIM]   -> Teil %d: %d/%d  (Magazin: %d)\n",
                        currentPart + 1,
                        totalCount[currentPart],
                        targetCount[currentPart],
                        simMagazineRemaining[currentPart]);
        }

        if (simMagazineRemaining[currentPart] == 0 &&
            totalCount[currentPart] < targetCount[currentPart]) {
          enterMagChangeForCurrentPart();
          break;
        }
      }

      if (totalCount[currentPart] >= targetCount[currentPart]) {
        int next = findNextPart(currentPart + 1);
        if (next < 0) {
          if (!finishedLatchedThisCycle) {
            statusLatch = (int)stateToStatusCodeNum(FINISHED);
            finishedLatchedThisCycle = true;
          }
          state = FINISHED;
          Serial.printf("[SIM] Auftrag abgeschlossen! Gesamt: %d Teile\n",
                        (int)sumTotalCount());
        } else {
          currentPart = next;
          if (!partCalibrated[currentPart]) {
            state = CALIBRATING;
            waitingForInsertConfirmationAfterCalibration = false;
            startCalibrationForPart(currentPart);
          } else {
            startDispensingForCurrentPart();
          }
        }
      }
    }
    break;

    case MAG_CHANGE:
    {
      statusLatch = -1;
      finishedLatchedThisCycle = false;

      if (btnPressedEdge) {
        Serial.println(F("[SIM] Button -> startMagazineChangeCalibration"));
        startMagazineChangeCalibration();
      }
    }
    break;

    case MAG_INSERT_CONFIRM:
    {
      statusLatch = -1;
      finishedLatchedThisCycle = false;

      if (btnPressedEdge) {
        Serial.println(F("[SIM] Button -> confirmNewMagazineInsertedAndResume"));
        confirmNewMagazineInsertedAndResume();
      }
    }
    break;

    case FINISHED:
    {
      // Zeitstempel beim ersten Eintreten in FINISHED setzen
      if (simFinishedEnteredMs == 0) {
        simFinishedEnteredMs = now;
        if (SIM_AUTO_PICKUP_DELAY_MS > 0) {
          Serial.printf("[SIM] FINISHED – Auto-Abholung in %lus\n",
                        SIM_AUTO_PICKUP_DELAY_MS / 1000);
        }
      }

      // Auto-Pickup: nach Ablauf der Wartezeit Button-Druck simulieren
      if (SIM_AUTO_PICKUP_DELAY_MS > 0 &&
          now - simFinishedEnteredMs >= SIM_AUTO_PICKUP_DELAY_MS) {
        btnPressedEdge = true;
        Serial.println(F("[SIM] Auto-Abholung: Button-Druck simuliert"));
      }

      if (btnPressedEdge) {
        simFinishedEnteredMs = 0;  // zurücksetzen für den nächsten Auftrag
        statusLatch = -1;
        finishedLatchedThisCycle = false;
        state = (stations > 0) ? WAIT_ORDER : NO_CLIENT;
        Serial.println(F("[SIM] FINISHED bestaetigt -> WAIT_ORDER"));
      }

      if (orderPending) {
        simFinishedEnteredMs = 0;
        state = WAIT_ORDER;
        statusLatch = -1;
        finishedLatchedThisCycle = false;
      }
    }
    break;

  }
}
