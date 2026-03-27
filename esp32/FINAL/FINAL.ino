#include <Arduino.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <esp_wifi.h>
#include <Preferences.h>

// =========================================================
// PIN-KONFIGURATION
// =========================================================

// ===== I2C =====
#define PIN_I2C_SDA 25
#define PIN_I2C_SCL 26

// ===== LEDs =====
#define PIN_LED_GREEN 14
#define PIN_LED_YELLOW 16
#define PIN_LED_RED 27
#define PIN_LED_BLUE 22

// ===== Button / Piezo =====
#define PIN_BUTTON 4
#define PIN_PIEZO 2

// ===== 1x 360° Servo Trichter =====
#define PIN_EXT_SERVO 15
#define PIN_EXT_SWITCH 34

// ===== 5x 360° Servos =====
#define SERVO_PIN_1 18
#define SERVO_PIN_2 19
#define SERVO_PIN_3 5
#define SERVO_PIN_4 17
#define SERVO_PIN_5 13

// ===== Multiplexer =====
#define PIN_MUX_SIG 12
#define PIN_MUX_S0 21
#define PIN_MUX_S1 23
#define PIN_MUX_S2 32
#define PIN_MUX_S3 33

// =========================================================
// Netzwerk
// =========================================================
static const char* AP_SSID = "Kommisionierautomat";
static const char* AP_PASS = "DCPS-WiSe2526";

IPAddress apIP(192, 168, 178, 1);
IPAddress apGW(192, 168, 178, 1);
IPAddress apSN(255, 255, 255, 0);

WebServer server(80);

// =========================================================
// LCD
// =========================================================
static const uint8_t LCD_I2C_ADDR = 0x27;
static const uint8_t LCD_COLS = 20;
static const uint8_t LCD_ROWS = 4;

LiquidCrystal_I2C lcd(LCD_I2C_ADDR, LCD_COLS, LCD_ROWS);

// =========================================================
// Systemparameter
// =========================================================
static const int PART_COUNT = 5;
static const int ACTIVE_PARTS = 5;
static const int ACTIVE_SERVOS = 5;

constexpr int SENSOR_ACTIVE_STATE = HIGH;

// Default-Servo-Werte (werden aus Flash geladen / überschrieben)
const int DEFAULT_SERVO_STOP_US = 1500;
const int DEFAULT_SERVO_RUN_US = 1545;
const int DEFAULT_SERVO_RUN_REV_US = 1400;

// Motor 2: Testmuster wie in der Referenzfunktion
static const int MOTOR2_INDEX = 1; // zweiter Motor = Index 1

const int DEFAULT_MOTOR2_CW_ANGLE   = 75;   // Zwischen 0 und 89
const int DEFAULT_MOTOR2_CCW_ANGLE  = 100;  // Zwischen 91 und 180
const int DEFAULT_MOTOR2_STOP_ANGLE = 90;

const unsigned long DEFAULT_MOTOR2_CW_MS = 30;
const unsigned long DEFAULT_MOTOR2_CCW_MS = 20;
const unsigned long DEFAULT_MOTOR2_STOP_MS = 10;
const unsigned long DEFAULT_MOTOR2_START_NEUTRAL_MS = 50;

// MUX Timing
const unsigned long MUX_TICK_US = 300;
const unsigned long MUX_SETTLE_US = 30;
const unsigned long HALL_DEBOUNCE_MS = 20;
const unsigned long DEFAULT_LB_DEBOUNCE_MS = 20;

// LED / Sound / Button
const unsigned long LED_BLINK_MS = 300;
const unsigned long BEEP_MS = 80;
const int BUZZ_FREQ_HZ = 2000;
const unsigned long BTN_DEBOUNCE_MS = 40;

// =========================================================
// Servo- und Sensorzuordnung
// =========================================================
static const int servoPins[PART_COUNT] = {
  SERVO_PIN_1,
  SERVO_PIN_2,
  SERVO_PIN_3,
  SERVO_PIN_4,
  SERVO_PIN_5
};

// Hall-Kanäle am MUX
static int hallChannels[PART_COUNT] = {
  0, 1, 2, 3, 4
};

// Lichtschranken-Kanäle am MUX
static int lbChannels[PART_COUNT] = {
  10, 11, 12, 13, 14
};

Servo servos[PART_COUNT];
Preferences preferences;

Servo externalServo;

const int EXTERNAL_SERVO_RUN_ANGLE = 150;
const int EXTERNAL_SERVO_STOP_ANGLE = 90;
bool externalServoIsRunning = false;

// pro Servo individuell speicherbar
int servoStopUs[PART_COUNT];
int servoRunFwdUs[PART_COUNT];
int servoRunRevUs[PART_COUNT];

// Pro Lichtschranke individuell speicherbar
unsigned long lbDebounceMs[PART_COUNT];

// Motor 2 wird weiterhin per Winkel (write) gesteuert
int motor2CwAngle;
int motor2CcwAngle;
int motor2StopAngle;

// Motor 2 Zeiten sind ebenfalls seriell einstellbar
unsigned long motor2CwMs;
unsigned long motor2CcwMs;
unsigned long motor2StopMs;
unsigned long motor2StartNeutralMs;

// =========================================================
// LCD-Texte
// =========================================================
static const char* TXT_NO_CLIENT_L0 = "AP initialisiert";
static const char* TXT_NO_CLIENT_L1 = "keine Verbindung";
static const char* TXT_NO_CLIENT_L2 = "SSID:{SSID}";
static const char* TXT_NO_CLIENT_L3 = "PW:{PASS}";

static const char* TXT_WAIT_ORDER_L0 = "Warte auf Bestellung";
static const char* TXT_WAIT_ORDER_L1 = "{DEV}";
static const char* TXT_WAIT_ORDER_L2 = "SSID:{SSID}";
static const char* TXT_WAIT_ORDER_L3 = "IP:{IP}";

static const char* TXT_DISPENSING_L0 = "Ausgabe Teil {PART}";
static const char* TXT_DISPENSING_L1 = "{CUR}/{TGT}";
static const char* TXT_DISPENSING_L2 = "Motor laeuft...";
static const char* TXT_DISPENSING_L3 = "";

static const char* TXT_MAG_CHANGE_L0 = "Magazinwechsel:";
static const char* TXT_MAG_CHANGE_L1 = "Magazin {PART}";
static const char* TXT_MAG_CHANGE_L2 = "1x Druecken =";
static const char* TXT_MAG_CHANGE_L3 = "Kalibrieren";

static const char* TXT_CALIB_L0 = "Kalibrierung aktiv";
static const char* TXT_CALIB_L1 = "Magazin {PART}";
static const char* TXT_CALIB_L2 = "Suche Endpunkt";
static const char* TXT_CALIB_L3 = "Bitte warten...";

static const char* TXT_INSERT_CONFIRM_L0 = "Neues Magazin";
static const char* TXT_INSERT_CONFIRM_L1 = "Magazin {PART}";
static const char* TXT_INSERT_CONFIRM_L2 = "Einsetzen und";
static const char* TXT_INSERT_CONFIRM_L3 = "erneut bestaetigen";

static const char* TXT_FINISHED_L0 = "Best. abgeschlossen";
static const char* TXT_FINISHED_L1 = "Bitte entnehmen!";
static const char* TXT_FINISHED_L2 = "Gesamtmenge: {SUM}";
static const char* TXT_FINISHED_L3 = "mit Enter bestaet.";

// =========================================================
// Zustände
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
int ausgabeWerte[PART_COUNT] = { 0, 0, 0, 0, 0 };
uint32_t targetCount[PART_COUNT] = { 0, 0, 0, 0, 0 };
uint32_t totalCount[PART_COUNT] = { 0, 0, 0, 0, 0 };
uint8_t magazinWechseln[PART_COUNT] = { 0, 0, 0, 0, 0 };

bool partCalibrated[PART_COUNT] = { false, false, false, false, false };

volatile bool orderPending = false;
int currentPart = -1;
int calibrationPart = -1;

// Merker, dass die aktuelle Kalibrierung aus einem Magazinwechsel stammt
// und danach eine zweite Bestätigung nötig ist.
bool waitingForInsertConfirmationAfterCalibration = false;

String firstStaMacCache = "";

// =========================================================
// Sensorzustände
// =========================================================
struct SensorState {
  bool hallLast = false;
  unsigned long hallStableSince = 0;

  bool lbLast = false;
  unsigned long lbLastEdgeMs = 0;

  bool hallStopArmed = false;
};

SensorState sensorState[PART_COUNT];

// =========================================================
// Motor-2-Ruckelzustand
// =========================================================
enum Motor2JerkPhase {
  MOTOR2_JERK_PHASE_START,
  MOTOR2_JERK_PHASE_CW,
  MOTOR2_JERK_PHASE_CCW,
  MOTOR2_JERK_PHASE_STOP
};

struct Motor2JerkState {
  bool active = false;
  Motor2JerkPhase phase = MOTOR2_JERK_PHASE_CW;
  unsigned long lastPhaseChangeMs = 0;
};

Motor2JerkState motor2Jerk;

// =========================================================
// UI / Button / Buzzer / LEDs
// =========================================================
bool btnStableState = HIGH;
bool btnLastReading = HIGH;
unsigned long btnLastChange = 0;
bool btnPressedEdge = false;

unsigned long lastBlueBlink = 0;
bool blueBlinkState = false;

unsigned long lastYellowBlink = 0;
bool yellowBlinkState = false;

unsigned long lastRedBlink = 0;
bool redBlinkState = false;

bool beeping = false;
unsigned long beepUntil = 0;

bool finishedBeepActive = false;
int finishedBeepStep = 0;
unsigned long finishedNextAt = 0;

const unsigned long FIN_START_GAP_MS = 1000;
const unsigned long FIN_BEEP_SHORT_MS = 100;
const unsigned long FIN_BEEP_LONG_MS = 500;
const unsigned long FIN_GAP_BETWEEN_MS = 200;
const unsigned long FIN_GROUP_GAP_MS = 500;

// LCD Cache
String lcdLine0 = "";
String lcdLine1 = "";
String lcdLine2 = "";
String lcdLine3 = "";

// LCD Render-State
struct LcdViewState {
  const char* l0 = nullptr;
  const char* l1 = nullptr;
  const char* l2 = nullptr;
  const char* l3 = nullptr;

  int currentPartIdx = -1;
  uint32_t cur = 0;
  uint32_t tgt = 0;
  bool useSum = false;
  String dev = "";
};

LcdViewState lcdCurrentView;
LcdViewState lcdLastRenderedView;
bool lcdDirty = true;

// Status
static int statusLatch = -1;
static bool finishedLatchedThisCycle = false;

// MUX scheduler
bool muxPhaseHall = false;
unsigned long lastMuxTickUs = 0;

// Serial
String serialLineBuffer;

// =========================================================
// Hilfsfunktionen
// =========================================================
static uint8_t stateToStatusCodeNum(RunState s) {
  switch (s) {
    case STARTUP_CALIBRATION: return 5;
    case NO_CLIENT: return 0;
    case WAIT_ORDER: return 1;
    case DISPENSING: return 2;
    case FINISHED: return 3;
    case MAG_CHANGE: return 4;
    case MAG_INSERT_CONFIRM: return 4;
    case CALIBRATING: return 5;
    default: return 0;
  }
}

static const char* stateToStatusCodeBin(RunState s) {
  switch (s) {
    case STARTUP_CALIBRATION: return "0101";
    case NO_CLIENT: return "0000";
    case WAIT_ORDER: return "0001";
    case DISPENSING: return "0010";
    case FINISHED: return "0011";
    case MAG_CHANGE: return "0100";
    case MAG_INSERT_CONFIRM: return "0100";
    case CALIBRATING: return "0101";
    default: return "0000";
  }
}

static void lcdWrite4(const String& l0, const String& l1, const String& l2, const String& l3) {
  auto writeLine = [&](uint8_t row, const String& text, String& cache) {
    if (text != cache) {
      lcd.setCursor(0, row);
      lcd.print("                    ");
      lcd.setCursor(0, row);
      lcd.print(text.substring(0, LCD_COLS));
      cache = text;
    }
  };

  writeLine(0, l0, lcdLine0);
  writeLine(1, l1, lcdLine1);
  writeLine(2, l2, lcdLine2);
  writeLine(3, l3, lcdLine3);
}

static bool lcdViewEquals(const LcdViewState& a, const LcdViewState& b) {
  return
    a.l0 == b.l0 &&
    a.l1 == b.l1 &&
    a.l2 == b.l2 &&
    a.l3 == b.l3 &&
    a.currentPartIdx == b.currentPartIdx &&
    a.cur == b.cur &&
    a.tgt == b.tgt &&
    a.useSum == b.useSum &&
    a.dev == b.dev;
}

static void ledsAllOff() {
  digitalWrite(PIN_LED_GREEN, LOW);
  digitalWrite(PIN_LED_YELLOW, LOW);
  digitalWrite(PIN_LED_RED, LOW);
}

static void beepTrigger(unsigned long now) {
  tone(PIN_PIEZO, BUZZ_FREQ_HZ);
  beeping = true;
  beepUntil = now + BEEP_MS;
}

static void startFinishedBeepPattern(unsigned long now) {
  finishedBeepActive = true;
  finishedBeepStep = 0;
  finishedNextAt = now;
}

static void updateFinishedBeepPattern(unsigned long now) {
  if (!finishedBeepActive) return;
  if (now < finishedNextAt) return;

  switch (finishedBeepStep) {
    case 0:
      noTone(PIN_PIEZO);
      beeping = false;
      finishedNextAt = now + FIN_START_GAP_MS;
      finishedBeepStep++;
      break;
    case 1:
      tone(PIN_PIEZO, BUZZ_FREQ_HZ);
      beeping = true;
      beepUntil = now + FIN_BEEP_SHORT_MS;
      finishedNextAt = now + FIN_BEEP_SHORT_MS;
      finishedBeepStep++;
      break;
    case 2:
      noTone(PIN_PIEZO);
      beeping = false;
      finishedNextAt = now + FIN_GAP_BETWEEN_MS;
      finishedBeepStep++;
      break;
    case 3:
      tone(PIN_PIEZO, BUZZ_FREQ_HZ);
      beeping = true;
      beepUntil = now + FIN_BEEP_LONG_MS;
      finishedNextAt = now + FIN_BEEP_LONG_MS;
      finishedBeepStep++;
      break;
    case 4:
      noTone(PIN_PIEZO);
      beeping = false;
      finishedNextAt = now + FIN_GROUP_GAP_MS;
      finishedBeepStep++;
      break;
    case 5:
      tone(PIN_PIEZO, BUZZ_FREQ_HZ);
      beeping = true;
      beepUntil = now + FIN_BEEP_SHORT_MS;
      finishedNextAt = now + FIN_BEEP_SHORT_MS;
      finishedBeepStep++;
      break;
    case 6:
      noTone(PIN_PIEZO);
      beeping = false;
      finishedNextAt = now + FIN_GAP_BETWEEN_MS;
      finishedBeepStep++;
      break;
    case 7:
      tone(PIN_PIEZO, BUZZ_FREQ_HZ);
      beeping = true;
      beepUntil = now + FIN_BEEP_LONG_MS;
      finishedNextAt = now + FIN_BEEP_LONG_MS;
      finishedBeepStep++;
      break;
    default:
      noTone(PIN_PIEZO);
      beeping = false;
      finishedBeepActive = false;
      break;
  }
}

static void updateButton(unsigned long now) {
  btnPressedEdge = false;

  bool reading = digitalRead(PIN_BUTTON);
  if (reading != btnLastReading) {
    btnLastChange = now;
    btnLastReading = reading;
  }

  if ((now - btnLastChange) > BTN_DEBOUNCE_MS) {
    if (btnStableState != reading) {
      btnStableState = reading;
      if (btnStableState == LOW) btnPressedEdge = true;
    }
  }
}

static String getFirstStationMac() {
  wifi_sta_list_t sta_list;
  memset(&sta_list, 0, sizeof(sta_list));

  if (esp_wifi_ap_get_sta_list(&sta_list) != ESP_OK) return "";
  if (sta_list.num <= 0) return "";

  const uint8_t* m = sta_list.sta[0].mac;
  char buf[18];
  snprintf(buf, sizeof(buf), "%02x:%02x:%02x:%02x:%02x:%02x",
           m[0], m[1], m[2], m[3], m[4], m[5]);
  return String(buf);
}

static uint32_t sumTotalCount() {
  uint32_t s = 0;
  for (int i = 0; i < ACTIVE_PARTS; i++) s += totalCount[i];
  return s;
}

static String applyPlaceholders(const String& tmpl,
                                int part1Based,
                                uint32_t cur,
                                uint32_t tgt,
                                uint32_t sum,
                                const String& dev) {
  String s = tmpl;
  s.replace("{PART}", String(part1Based));
  s.replace("{CUR}", String(cur));
  s.replace("{TGT}", String(tgt));
  s.replace("{SUM}", String(sum));
  s.replace("{SSID}", String(AP_SSID));
  s.replace("{PASS}", String(AP_PASS));
  s.replace("{IP}", WiFi.softAPIP().toString());
  s.replace("{DEV}", dev);
  return s;
}

static void requestStatusText(const char* l0, const char* l1, const char* l2, const char* l3,
                              int currentPartIdx,
                              uint32_t cur,
                              uint32_t tgt,
                              bool useSum,
                              const String& dev) {
  LcdViewState next;
  next.l0 = l0;
  next.l1 = l1;
  next.l2 = l2;
  next.l3 = l3;
  next.currentPartIdx = currentPartIdx;
  next.cur = cur;
  next.tgt = tgt;
  next.useSum = useSum;
  next.dev = dev;

  if (!lcdViewEquals(next, lcdCurrentView)) {
    lcdCurrentView = next;
    lcdDirty = true;
  }
}

static void renderLcdIfNeeded() {
  if (!lcdDirty) return;

  if (lcdViewEquals(lcdCurrentView, lcdLastRenderedView)) {
    lcdDirty = false;
    return;
  }

  int part1Based = (lcdCurrentView.currentPartIdx >= 0) ? (lcdCurrentView.currentPartIdx + 1) : 0;
  uint32_t sum = lcdCurrentView.useSum ? sumTotalCount() : 0;

  lcdWrite4(
    applyPlaceholders(lcdCurrentView.l0 ? lcdCurrentView.l0 : "", part1Based, lcdCurrentView.cur, lcdCurrentView.tgt, sum, lcdCurrentView.dev),
    applyPlaceholders(lcdCurrentView.l1 ? lcdCurrentView.l1 : "", part1Based, lcdCurrentView.cur, lcdCurrentView.tgt, sum, lcdCurrentView.dev),
    applyPlaceholders(lcdCurrentView.l2 ? lcdCurrentView.l2 : "", part1Based, lcdCurrentView.cur, lcdCurrentView.tgt, sum, lcdCurrentView.dev),
    applyPlaceholders(lcdCurrentView.l3 ? lcdCurrentView.l3 : "", part1Based, lcdCurrentView.cur, lcdCurrentView.tgt, sum, lcdCurrentView.dev)
  );

  lcdLastRenderedView = lcdCurrentView;
  lcdDirty = false;
}

static void showStatusText(const char* l0, const char* l1, const char* l2, const char* l3,
                           int currentPartIdx,
                           uint32_t cur,
                           uint32_t tgt,
                           bool useSum,
                           const String& dev) {
  requestStatusText(l0, l1, l2, l3, currentPartIdx, cur, tgt, useSum, dev);
}

// =========================================================
// Externer Servo / Schalter
// =========================================================
static void initExternalServo() {
  // GPIO34 ist input-only und hat KEIN internes Pullup.
  // Deshalb hier nur INPUT verwenden.
  pinMode(PIN_EXT_SWITCH, INPUT);

  externalServo.setPeriodHertz(50);
  externalServo.attach(PIN_EXT_SERVO, 500, 2500);
  externalServo.write(EXTERNAL_SERVO_STOP_ANGLE);
}

static void updateExternalServo() {
  bool shouldRun = (digitalRead(PIN_EXT_SWITCH) == LOW);

  if (shouldRun != externalServoIsRunning) {
    externalServoIsRunning = shouldRun;

    if (externalServoIsRunning) {
      externalServo.write(EXTERNAL_SERVO_RUN_ANGLE);
    } else {
      externalServo.write(EXTERNAL_SERVO_STOP_ANGLE);
    }
  }
}

// =========================================================
// Persistente Servo-Konfiguration
// =========================================================
static int clampServoUs(int us) {
  if (us < 500) return 500;
  if (us > 2500) return 2500;
  return us;
}

static int clampServoAngle(int angle) {
  if (angle < 0) return 0;
  if (angle > 180) return 180;
  return angle;
}

static unsigned long clampMotor2TimeMs(unsigned long value) {
  if (value < 1) return 1;
  if (value > 5000) return 5000;
  return value;
}

static unsigned long clampLbDebounceMs(unsigned long value) {
  if (value < 1) return 1;
  if (value > 1000) return 1000;
  return value;
}

static void setDefaultServoConfig() {
  for (int i = 0; i < PART_COUNT; i++) {
    servoStopUs[i] = DEFAULT_SERVO_STOP_US;
    servoRunFwdUs[i] = DEFAULT_SERVO_RUN_US;
    servoRunRevUs[i] = DEFAULT_SERVO_RUN_REV_US;
  }

  motor2CwAngle = DEFAULT_MOTOR2_CW_ANGLE;
  motor2CcwAngle = DEFAULT_MOTOR2_CCW_ANGLE;
  motor2StopAngle = DEFAULT_MOTOR2_STOP_ANGLE;

  motor2CwMs = DEFAULT_MOTOR2_CW_MS;
  motor2CcwMs = DEFAULT_MOTOR2_CCW_MS;
  motor2StopMs = DEFAULT_MOTOR2_STOP_MS;
  motor2StartNeutralMs = DEFAULT_MOTOR2_START_NEUTRAL_MS;

  for (int i = 0; i < PART_COUNT; i++) {
    lbDebounceMs[i] = DEFAULT_LB_DEBOUNCE_MS;
  }
}

static void loadServoConfig() {
  preferences.begin("servoCfg", true);

  for (int i = 0; i < PART_COUNT; i++) {
    String keyStop = "s" + String(i) + "_st";
    String keyFwd = "s" + String(i) + "_fw";
    String keyRev = "s" + String(i) + "_rv";
    String keyLbDb = "lb" + String(i) + "_db";

    servoStopUs[i] = clampServoUs(preferences.getInt(keyStop.c_str(), DEFAULT_SERVO_STOP_US));
    servoRunFwdUs[i] = clampServoUs(preferences.getInt(keyFwd.c_str(), DEFAULT_SERVO_RUN_US));
    servoRunRevUs[i] = clampServoUs(preferences.getInt(keyRev.c_str(), DEFAULT_SERVO_RUN_REV_US));
    lbDebounceMs[i] = clampLbDebounceMs(
      (unsigned long)preferences.getUInt(keyLbDb.c_str(), (uint32_t)DEFAULT_LB_DEBOUNCE_MS)
    );
  }

  motor2CwAngle = clampServoAngle(preferences.getInt("m2cw", DEFAULT_MOTOR2_CW_ANGLE));
  motor2CcwAngle = clampServoAngle(preferences.getInt("m2ccw", DEFAULT_MOTOR2_CCW_ANGLE));
  motor2StopAngle = clampServoAngle(preferences.getInt("m2stop", DEFAULT_MOTOR2_STOP_ANGLE));

  motor2CwMs = clampMotor2TimeMs((unsigned long)preferences.getUInt("m2cwms", (uint32_t)DEFAULT_MOTOR2_CW_MS));
  motor2CcwMs = clampMotor2TimeMs((unsigned long)preferences.getUInt("m2ccwms", (uint32_t)DEFAULT_MOTOR2_CCW_MS));
  motor2StopMs = clampMotor2TimeMs((unsigned long)preferences.getUInt("m2stopms", (uint32_t)DEFAULT_MOTOR2_STOP_MS));
  motor2StartNeutralMs = clampMotor2TimeMs((unsigned long)preferences.getUInt("m2startms", (uint32_t)DEFAULT_MOTOR2_START_NEUTRAL_MS));

  preferences.end();
}

static void saveServoConfig() {
  preferences.begin("servoCfg", false);

  for (int i = 0; i < PART_COUNT; i++) {
    String keyStop = "s" + String(i) + "_st";
    String keyFwd = "s" + String(i) + "_fw";
    String keyRev = "s" + String(i) + "_rv";
    String keyLbDb = "lb" + String(i) + "_db";

    preferences.putInt(keyStop.c_str(), servoStopUs[i]);
    preferences.putInt(keyFwd.c_str(), servoRunFwdUs[i]);
    preferences.putInt(keyRev.c_str(), servoRunRevUs[i]);
    preferences.putUInt(keyLbDb.c_str(), (uint32_t)lbDebounceMs[i]);
  }

  preferences.putInt("m2cw", motor2CwAngle);
  preferences.putInt("m2ccw", motor2CcwAngle);
  preferences.putInt("m2stop", motor2StopAngle);

  preferences.putUInt("m2cwms", (uint32_t)motor2CwMs);
  preferences.putUInt("m2ccwms", (uint32_t)motor2CcwMs);
  preferences.putUInt("m2stopms", (uint32_t)motor2StopMs);
  preferences.putUInt("m2startms", (uint32_t)motor2StartNeutralMs);

  preferences.end();
}

static void printServoConfig() {
  Serial.println();
  Serial.println(F("=== Servo-Konfiguration ==="));
  for (int i = 0; i < PART_COUNT; i++) {
    Serial.printf("Servo %d -> stop=%d  fwd=%d  rev=%d  lb_db=%lu ms\n",
                  i + 1, servoStopUs[i], servoRunFwdUs[i], servoRunRevUs[i], lbDebounceMs[i]);
  }
  Serial.printf("Motor 2 Winkel -> cw=%d  ccw=%d  stop=%d\n",
                motor2CwAngle, motor2CcwAngle, motor2StopAngle);
  Serial.printf("Motor 2 Zeiten -> start=%lu ms  cw=%lu ms  ccw=%lu ms  stop=%lu ms\n",
                motor2StartNeutralMs, motor2CwMs, motor2CcwMs, motor2StopMs);
  Serial.println(F("==========================="));
  Serial.println();
}

// =========================================================
// Servo-Funktionen
// =========================================================
static void motor2JerkReset() {
  motor2Jerk.active = false;
  motor2Jerk.phase = MOTOR2_JERK_PHASE_START;
  motor2Jerk.lastPhaseChangeMs = 0;
  servos[MOTOR2_INDEX].write(motor2StopAngle);
}

static bool isMotor2DispensingActive() {
  return (state == DISPENSING && currentPart == MOTOR2_INDEX);
}

static void initServos() {
  for (int i = 0; i < ACTIVE_SERVOS; i++) {
    servos[i].setPeriodHertz(50);
    servos[i].attach(servoPins[i], 500, 2500);
    servos[i].writeMicroseconds(servoStopUs[i]);
  }
}

static void servoStop(int idx) {
  if (idx < 0 || idx >= ACTIVE_SERVOS) return;

  if (idx == MOTOR2_INDEX) {
    motor2JerkReset();
    return;
  }

  servos[idx].writeMicroseconds(servoStopUs[idx]);
}

static void servoRunForward(int idx) {
  if (idx < 0 || idx >= ACTIVE_SERVOS) return;

  if (idx == MOTOR2_INDEX) {
    motor2Jerk.active = true;
    motor2Jerk.phase = MOTOR2_JERK_PHASE_START;
    motor2Jerk.lastPhaseChangeMs = millis();
    servos[idx].write(motor2StopAngle); // erst neutral
    return;
  }

  servos[idx].writeMicroseconds(servoRunFwdUs[idx]);
}

static void servoRunReverse(int idx) {
  if (idx < 0 || idx >= ACTIVE_SERVOS) return;

  if (idx == MOTOR2_INDEX) {
    motor2JerkReset();
  }

  servos[idx].writeMicroseconds(servoRunRevUs[idx]);
}

static void stopAllServos() {
  for (int i = 0; i < ACTIVE_SERVOS; i++) servoStop(i);
}

static void updateMotor2Jerk(unsigned long now) {
  if (!motor2Jerk.active) return;

  if (!isMotor2DispensingActive()) {
    motor2JerkReset();
    return;
  }

  switch (motor2Jerk.phase) {
    case MOTOR2_JERK_PHASE_START:
      if (now - motor2Jerk.lastPhaseChangeMs >= motor2StartNeutralMs) {
        servos[MOTOR2_INDEX].write(motor2CwAngle);
        motor2Jerk.phase = MOTOR2_JERK_PHASE_CW;
        motor2Jerk.lastPhaseChangeMs = now;
      }
      break;

    case MOTOR2_JERK_PHASE_CW:
      if (now - motor2Jerk.lastPhaseChangeMs >= motor2CwMs) {
        servos[MOTOR2_INDEX].write(motor2CcwAngle);
        motor2Jerk.phase = MOTOR2_JERK_PHASE_CCW;
        motor2Jerk.lastPhaseChangeMs = now;
      }
      break;

    case MOTOR2_JERK_PHASE_CCW:
      if (now - motor2Jerk.lastPhaseChangeMs >= motor2CcwMs) {
        servos[MOTOR2_INDEX].write(motor2StopAngle);
        motor2Jerk.phase = MOTOR2_JERK_PHASE_STOP;
        motor2Jerk.lastPhaseChangeMs = now;
      }
      break;

    case MOTOR2_JERK_PHASE_STOP:
      if (now - motor2Jerk.lastPhaseChangeMs >= motor2StopMs) {
        servos[MOTOR2_INDEX].write(motor2CwAngle);
        motor2Jerk.phase = MOTOR2_JERK_PHASE_CW;
        motor2Jerk.lastPhaseChangeMs = now;
      }
      break;
  }
}

// =========================================================
// MUX-Funktionen
// =========================================================
static void setMuxChannel(int ch) {
  ch = constrain(ch, 0, 15);
  digitalWrite(PIN_MUX_S0, (ch >> 0) & 0x01);
  digitalWrite(PIN_MUX_S1, (ch >> 1) & 0x01);
  digitalWrite(PIN_MUX_S2, (ch >> 2) & 0x01);
  digitalWrite(PIN_MUX_S3, (ch >> 3) & 0x01);
}

static int readMuxDigital(int ch) {
  setMuxChannel(ch);
  delayMicroseconds(MUX_SETTLE_US);
  return digitalRead(PIN_MUX_SIG);
}

static inline bool isSensorActiveRaw(int raw) {
  return raw == SENSOR_ACTIVE_STATE;
}

static bool readHallNow(int partIdx) {
  if (partIdx < 0 || partIdx >= ACTIVE_PARTS || hallChannels[partIdx] < 0) return false;
  return isSensorActiveRaw(readMuxDigital(hallChannels[partIdx]));
}

static bool readLbNow(int partIdx) {
  if (partIdx < 0 || partIdx >= ACTIVE_PARTS || lbChannels[partIdx] < 0) return false;
  return isSensorActiveRaw(readMuxDigital(lbChannels[partIdx]));
}

// =========================================================
// Sensorlogik
// =========================================================
static void resetOrderCounters() {
  unsigned long now = millis();
  for (int i = 0; i < ACTIVE_PARTS; i++) {
    totalCount[i] = 0;
    sensorState[i].lbLastEdgeMs = 0;
    sensorState[i].hallStableSince = now;
    sensorState[i].hallStopArmed = false;
  }
}

static void syncInitialSensorStates() {
  unsigned long now = millis();
  for (int i = 0; i < ACTIVE_PARTS; i++) {
    if (lbChannels[i] >= 0) {
      sensorState[i].lbLast = readLbNow(i);
    }
    if (hallChannels[i] >= 0) {
      sensorState[i].hallLast = readHallNow(i);
      sensorState[i].hallStableSince = now;
    }
  }
}

static void updateLightBarrierCountForPart(int partIdx, bool lbNow) {
  if (partIdx < 0 || partIdx >= ACTIVE_PARTS) return;

  SensorState& ss = sensorState[partIdx];
  unsigned long now = millis();

  if (state == CALIBRATING || state == STARTUP_CALIBRATION) {
    ss.lbLast = lbNow;
    return;
  }

  if (ss.lbLast && !lbNow) {
    if (now - ss.lbLastEdgeMs >= lbDebounceMs[partIdx]) {
      totalCount[partIdx]++;
      ss.lbLastEdgeMs = now;

      if (state == DISPENSING && partIdx == currentPart && !finishedBeepActive) {
        beepTrigger(now);
      }
    }
  }

  ss.lbLast = lbNow;
}

static bool isHallStableActiveForPart(int partIdx, bool hallNow) {
  if (partIdx < 0 || partIdx >= ACTIVE_PARTS) return false;

  SensorState& ss = sensorState[partIdx];
  unsigned long now = millis();

  if (hallNow != ss.hallLast) {
    ss.hallLast = hallNow;
    ss.hallStableSince = now;
  }

  return hallNow && (now - ss.hallStableSince >= HALL_DEBOUNCE_MS);
}

static void muxTickCurrentPart() {
  int partToScan = -1;

  if (state == STARTUP_CALIBRATION || state == CALIBRATING) {
    partToScan = calibrationPart;
  } else {
    partToScan = currentPart;
  }

  if (partToScan < 0 || partToScan >= ACTIVE_PARTS) return;

  unsigned long nowUs = micros();
  if (nowUs - lastMuxTickUs < MUX_TICK_US) return;
  lastMuxTickUs = nowUs;

  if (!muxPhaseHall) {
    if (lbChannels[partToScan] >= 0) {
      bool lbNow = readLbNow(partToScan);
      updateLightBarrierCountForPart(partToScan, lbNow);
    }
  } else {
    if (hallChannels[partToScan] >= 0) {
      bool hallNow = readHallNow(partToScan);
      (void)isHallStableActiveForPart(partToScan, hallNow);
    }
  }

  muxPhaseHall = !muxPhaseHall;
}

// =========================================================
// Ablauf-Helfer
// =========================================================
static int findNextPart(int startIdx) {
  for (int i = startIdx; i < ACTIVE_PARTS; i++) {
    if (targetCount[i] > 0) return i;
  }
  return -1;
}

static int findNextUncalibratedPart(int startIdx) {
  for (int i = startIdx; i < ACTIVE_PARTS; i++) {
    if (!partCalibrated[i]) return i;
  }
  return -1;
}

static void startCalibrationForPart(int partIdx) {
  if (partIdx < 0 || partIdx >= ACTIVE_PARTS) return;

  calibrationPart = partIdx;
  sensorState[partIdx].hallLast = readHallNow(partIdx);
  sensorState[partIdx].hallStableSince = millis();
  sensorState[partIdx].hallStopArmed = false;

  servoRunReverse(partIdx);
}

static void startDispensingForCurrentPart() {
  if (currentPart < 0 || currentPart >= ACTIVE_PARTS) return;

  bool hallNow = readHallNow(currentPart);

  sensorState[currentPart].hallStopArmed = !hallNow;
  sensorState[currentPart].hallLast = hallNow;
  sensorState[currentPart].hallStableSince = millis();

  servoRunForward(currentPart);
  state = DISPENSING;
}

static void enterMagChangeForCurrentPart() {
  if (currentPart < 0 || currentPart >= ACTIVE_PARTS) return;

  servoStop(currentPart);
  magazinWechseln[currentPart] = 1;
  partCalibrated[currentPart] = false;
  waitingForInsertConfirmationAfterCalibration = false;

  digitalWrite(PIN_LED_YELLOW, LOW);
  yellowBlinkState = false;

  lastRedBlink = millis();
  redBlinkState = false;
  digitalWrite(PIN_LED_RED, LOW);

  state = MAG_CHANGE;
}

static void startMagazineChangeCalibration() {
  if (currentPart < 0 || currentPart >= ACTIVE_PARTS) return;

  digitalWrite(PIN_LED_RED, LOW);
  redBlinkState = false;

  waitingForInsertConfirmationAfterCalibration = true;
  state = CALIBRATING;
  startCalibrationForPart(currentPart);
}

static void confirmNewMagazineInsertedAndResume() {
  if (currentPart < 0 || currentPart >= ACTIVE_PARTS) return;

  magazinWechseln[currentPart] = 0;
  waitingForInsertConfirmationAfterCalibration = false;

  digitalWrite(PIN_LED_RED, LOW);
  redBlinkState = false;

  stopAllServos();
  currentPart = -1;
  state = WAIT_ORDER;
}

// =========================================================
// JSON / API
// =========================================================
static void sendJson(int code, const JsonDocument& doc) {
  String out;
  serializeJson(doc, out);
  server.send(code, "application/json", out);
}

static bool requireKeyInt(JsonVariantConst v, const char* key, int& outVal) {
  if (!v.is<JsonObjectConst>()) return false;
  JsonObjectConst obj = v.as<JsonObjectConst>();
  if (!obj.containsKey(key)) return false;
  JsonVariantConst x = obj[key];
  if (!x.is<int>() && !x.is<long>() && !x.is<float>() && !x.is<double>()) return false;
  outVal = (int)x.as<long>();
  return true;
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

  resp["system_zeit"] = (uint32_t)millis();
  resp["status"] = statusLatch;
  resp["status_bin"] = stateToStatusCodeBin(state);
  resp["aktuelles_teil"] = currentPart + 1;
  resp["warte_auf_magazin_einsetzen"] = (state == MAG_INSERT_CONFIRM) ? 1 : 0;

  bool allCalibrated = true;
  for (int i = 0; i < PART_COUNT; i++) {
    if (!partCalibrated[i]) {
      allCalibrated = false;
      break;
    }
  }
  resp["kalibriert"] = allCalibrated ? 1 : 0;
}

static void sendStatusAndConsume() {
  StaticJsonDocument<896> resp;
  buildStatusJson(resp);
  sendJson(200, resp);
  if (statusLatch != -1) statusLatch = -1;
}

void handleRoot() {
  String msg;
  msg += "ESP32 AP Webserver\n";
  msg += "POST JSON to /setAusgabe\n";
  msg += "{ \"wert1\":10,\"wert2\":20,\"wert3\":30,\"wert4\":40,\"wert5\":50 }\n";
  msg += "GET  /status\n";
  msg += "POST /magazinwechsel\n";
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
  if (!server.hasArg("plain")) {
    server.send(400, "text/plain", "Bad Request: missing body");
    return;
  }

  StaticJsonDocument<128> doc;
  DeserializationError err = deserializeJson(doc, server.arg("plain"));
  if (err) {
    server.send(400, "text/plain", "Bad Request: invalid JSON");
    return;
  }

  sendStatusAndConsume();
}

void handleMagazinwechsel() {
  if (server.method() != HTTP_POST) {
    server.send(405, "text/plain", "Method Not Allowed");
    return;
  }
  if (!server.hasArg("plain")) {
    server.send(400, "text/plain", "Bad Request: missing body");
    return;
  }

  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, server.arg("plain"));
  if (err) {
    server.send(400, "text/plain", "Bad Request: invalid JSON");
    return;
  }

  int changed[PART_COUNT] = { 0, 0, 0, 0, 0 };
  bool ok =
    requireKeyInt(doc, "magazin1_gewechselt", changed[0]) &&
    requireKeyInt(doc, "magazin2_gewechselt", changed[1]) &&
    requireKeyInt(doc, "magazin3_gewechselt", changed[2]) &&
    requireKeyInt(doc, "magazin4_gewechselt", changed[3]) &&
    requireKeyInt(doc, "magazin5_gewechselt", changed[4]);

  if (!ok) {
    server.send(400, "text/plain", "Bad Request: expected keys magazin1_gewechselt..magazin5_gewechselt");
    return;
  }

  if (currentPart >= 0 && currentPart < PART_COUNT && changed[currentPart] == 1) {
    if (state == MAG_CHANGE) {
      startMagazineChangeCalibration();
    } else if (state == MAG_INSERT_CONFIRM) {
      confirmNewMagazineInsertedAndResume();
    }
  }

  StaticJsonDocument<896> resp;
  buildStatusJson(resp);
  sendJson(200, resp);
}

void handleMagazinwechselStart() {
  if (server.method() != HTTP_POST) {
    server.send(405, "text/plain", "Method Not Allowed");
    return;
  }

  if (state == WAIT_ORDER) {
    if (!server.hasArg("plain")) {
      server.send(400, "text/plain", "Bad Request: missing body");
      return;
    }
    StaticJsonDocument<64> doc;
    DeserializationError err = deserializeJson(doc, server.arg("plain"));
    if (err) {
      server.send(400, "text/plain", "Bad Request: invalid JSON");
      return;
    }
    int part;
    if (!requireKeyInt(doc, "part", part) || part < 1 || part > PART_COUNT) {
      server.send(400, "text/plain", "Bad Request: expected 'part' (1..PART_COUNT)");
      return;
    }
    currentPart = part - 1;
    enterMagChangeForCurrentPart();
    startMagazineChangeCalibration();
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

  startMagazineChangeCalibration();
  server.send(200, "text/plain", "OK");
}

void handleSetAusgabe() {
  if (server.method() != HTTP_POST) {
    server.send(405, "text/plain", "Method Not Allowed");
    return;
  }
  if (!server.hasArg("plain")) {
    server.send(400, "text/plain", "Bad Request: missing body");
    return;
  }

  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, server.arg("plain"));
  if (err) {
    server.send(400, "text/plain", "Bad Request: invalid JSON");
    return;
  }

  int w[PART_COUNT];
  bool ok =
    requireKeyInt(doc, "wert1", w[0]) &&
    requireKeyInt(doc, "wert2", w[1]) &&
    requireKeyInt(doc, "wert3", w[2]) &&
    requireKeyInt(doc, "wert4", w[3]) &&
    requireKeyInt(doc, "wert5", w[4]);

  if (!ok) {
    server.send(400, "text/plain", "Bad Request: expected keys wert1..wert5 with numeric values");
    return;
  }

  JsonObject obj = doc.as<JsonObject>();
  if (obj.size() != 5) {
    server.send(400, "text/plain", "Bad Request: must contain exactly 5 values");
    return;
  }

  for (int i = 0; i < PART_COUNT; i++) {
    ausgabeWerte[i] = w[i];
    targetCount[i] = (w[i] < 0) ? 0 : (uint32_t)w[i];
  }

  orderPending = true;
  statusLatch = -1;
  finishedLatchedThisCycle = false;

  StaticJsonDocument<192> resp;
  resp["status"] = "ok";
  resp["message"] = "received";
  JsonArray values = resp["values"].to<JsonArray>();
  for (int i = 0; i < PART_COUNT; i++) values.add(ausgabeWerte[i]);

  sendJson(200, resp);
}

void setupAccessPointAndServer() {
  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(apIP, apGW, apSN);
  WiFi.softAP(AP_SSID, AP_PASS);

  server.on("/", HTTP_GET, handleRoot);
  server.on("/setAusgabe", HTTP_POST, handleSetAusgabe);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/magazinwechsel", HTTP_POST, handleMagazinwechsel);
  server.on("/magazinwechsel/start", HTTP_POST, handleMagazinwechselStart);
  server.on("/data", HTTP_POST, handleData);

  server.begin();
}

// =========================================================
// Serial-Kommandos
// =========================================================
static void printHelp() {
  Serial.println();
  Serial.println(F("Serielle Befehle:"));
  Serial.println(F("  help"));
  Serial.println(F("  show"));
  Serial.println(F("  save"));
  Serial.println(F("  load"));
  Serial.println(F("  set <servo> <stop|fwd|rev> <wert>"));
  Serial.println(F("  setm2 <cw|ccw|stop> <winkel>"));
  Serial.println(F("  setm2ms <cw|ccw|stop|start> <ms>"));
  Serial.println(F("  setlb <lichtschranke> <ms>"));
  Serial.println(F("Beispiele:"));
  Serial.println(F("  set 1 fwd 1650"));
  Serial.println(F("  set 3 rev 1320"));
  Serial.println(F("  set 5 stop 1500"));
  Serial.println(F("  setm2 cw 100"));
  Serial.println(F("  setm2 ccw 80"));
  Serial.println(F("  setm2 stop 90"));
  Serial.println(F("  setm2ms cw 30"));
  Serial.println(F("  setm2ms ccw 20"));
  Serial.println(F("  setm2ms stop 10"));
  Serial.println(F("  setm2ms start 50"));
  Serial.println(F("  setlb 1 25"));
  Serial.println(F("  setlb 3 40"));
  Serial.println();
}

static void handleSerialCommand(String line) {
  line.trim();
  if (line.length() == 0) return;

  String original = line;
  line.toLowerCase();

  if (line == "help") {
    printHelp();
    return;
  }

  if (line == "show") {
    printServoConfig();
    return;
  }

  if (line == "save") {
    saveServoConfig();
    Serial.println(F("Servo-Werte gespeichert."));
    return;
  }

  if (line == "load") {
    loadServoConfig();
    printServoConfig();
    Serial.println(F("Servo-Werte neu geladen."));
    return;
  }

  if (line.startsWith("setm2ms ")) {
    int p1 = line.indexOf(' ');
    int p2 = line.indexOf(' ', p1 + 1);

    if (p2 < 0) {
      Serial.println(F("Fehler: Format ist 'setm2ms <cw|ccw|stop|start> <ms>'"));
      return;
    }

    String mode = line.substring(p1 + 1, p2);
    unsigned long value = (unsigned long)line.substring(p2 + 1).toInt();
    value = clampMotor2TimeMs(value);

    bool ok = true;

    if (mode == "cw") {
      motor2CwMs = value;
    } else if (mode == "ccw") {
      motor2CcwMs = value;
    } else if (mode == "stop") {
      motor2StopMs = value;
    } else if (mode == "start") {
      motor2StartNeutralMs = value;
    } else {
      ok = false;
    }

    if (!ok) {
      Serial.println(F("Fehler: Modus nur cw, ccw, stop oder start."));
      return;
    }

    saveServoConfig();

    Serial.printf("Motor 2 Zeiten aktualisiert: start=%lu ms  cw=%lu ms  ccw=%lu ms  stop=%lu ms\n",
                  motor2StartNeutralMs, motor2CwMs, motor2CcwMs, motor2StopMs);
    return;
  }

  if (line.startsWith("setm2 ")) {
    int p1 = line.indexOf(' ');
    int p2 = line.indexOf(' ', p1 + 1);

    if (p2 < 0) {
      Serial.println(F("Fehler: Format ist 'setm2 <cw|ccw|stop> <winkel>'"));
      return;
    }

    String mode = line.substring(p1 + 1, p2);
    int value = line.substring(p2 + 1).toInt();
    value = clampServoAngle(value);

    bool ok = true;

    if (mode == "cw") {
      motor2CwAngle = value;
    } else if (mode == "ccw") {
      motor2CcwAngle = value;
    } else if (mode == "stop") {
      motor2StopAngle = value;
    } else {
      ok = false;
    }

    if (!ok) {
      Serial.println(F("Fehler: Modus nur cw, ccw oder stop."));
      return;
    }

    saveServoConfig();

    if (state != DISPENSING && state != CALIBRATING && state != STARTUP_CALIBRATION) {
      servos[MOTOR2_INDEX].write(motor2StopAngle);
    }

    Serial.printf("Motor 2 aktualisiert: cw=%d  ccw=%d  stop=%d\n",
                  motor2CwAngle, motor2CcwAngle, motor2StopAngle);
    return;
  }

  if (line.startsWith("setlb ")) {
    int p1 = line.indexOf(' ');
    int p2 = line.indexOf(' ', p1 + 1);

    if (p2 < 0) {
      Serial.println(F("Fehler: Format ist 'setlb <lichtschranke> <ms>'"));
      return;
    }

    int lbIdx1 = line.substring(p1 + 1, p2).toInt();
    unsigned long value = (unsigned long)line.substring(p2 + 1).toInt();

    if (lbIdx1 < 1 || lbIdx1 > PART_COUNT) {
      Serial.println(F("Fehler: Lichtschranke muss 1..5 sein."));
      return;
    }

    value = clampLbDebounceMs(value);
    int idx = lbIdx1 - 1;
    lbDebounceMs[idx] = value;

    saveServoConfig();

    Serial.printf("Lichtschranke %d Debounce aktualisiert: %lu ms\n",
                  lbIdx1, lbDebounceMs[idx]);
    return;
  }

  if (line.startsWith("set ")) {
    int p1 = line.indexOf(' ');
    int p2 = line.indexOf(' ', p1 + 1);
    int p3 = line.indexOf(' ', p2 + 1);

    if (p2 < 0 || p3 < 0) {
      Serial.println(F("Fehler: Format ist 'set <servo> <stop|fwd|rev> <wert>'"));
      return;
    }

    int servoIdx1 = line.substring(p1 + 1, p2).toInt();
    String mode = line.substring(p2 + 1, p3);
    int value = line.substring(p3 + 1).toInt();

    if (servoIdx1 < 1 || servoIdx1 > PART_COUNT) {
      Serial.println(F("Fehler: Servo muss 1..5 sein."));
      return;
    }

    value = clampServoUs(value);
    int idx = servoIdx1 - 1;
    bool ok = true;

    if (mode == "stop") {
      servoStopUs[idx] = value;
    } else if (mode == "fwd") {
      servoRunFwdUs[idx] = value;
    } else if (mode == "rev") {
      servoRunRevUs[idx] = value;
    } else {
      ok = false;
    }

    if (!ok) {
      Serial.println(F("Fehler: Modus nur stop, fwd oder rev."));
      return;
    }

    saveServoConfig();

    if (state != DISPENSING && state != CALIBRATING && state != STARTUP_CALIBRATION) {
      servoStop(idx);
    }

    Serial.printf("Servo %d aktualisiert: stop=%d fwd=%d rev=%d\n",
                  servoIdx1, servoStopUs[idx], servoRunFwdUs[idx], servoRunRevUs[idx]);
    return;
  }

  Serial.print(F("Unbekannter Befehl: "));
  Serial.println(original);
  printHelp();
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
        Serial.println(F("Eingabe zu lang, verworfen."));
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

  pinMode(PIN_LED_GREEN, OUTPUT);
  pinMode(PIN_LED_YELLOW, OUTPUT);
  pinMode(PIN_LED_RED, OUTPUT);
  pinMode(PIN_LED_BLUE, OUTPUT);

  pinMode(PIN_PIEZO, OUTPUT);
  noTone(PIN_PIEZO);

  pinMode(PIN_BUTTON, INPUT_PULLUP);

  initExternalServo();

  pinMode(PIN_MUX_S0, OUTPUT);
  pinMode(PIN_MUX_S1, OUTPUT);
  pinMode(PIN_MUX_S2, OUTPUT);
  pinMode(PIN_MUX_S3, OUTPUT);
  pinMode(PIN_MUX_SIG, INPUT);

  ledsAllOff();
  digitalWrite(PIN_LED_BLUE, LOW);

  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  lcd.init();
  lcd.backlight();
  lcd.clear();

  setDefaultServoConfig();
  loadServoConfig();
  initServos();
  stopAllServos();
  motor2JerkReset();

  setupAccessPointAndServer();
  syncInitialSensorStates();

  Serial.println(F("System gestartet."));
  printServoConfig();
  printHelp();

  currentPart = -1;
  calibrationPart = 0;
  waitingForInsertConfirmationAfterCalibration = false;
  state = STARTUP_CALIBRATION;
  startCalibrationForPart(calibrationPart);

  showStatusText(TXT_CALIB_L0, TXT_CALIB_L1, "Initiale Kalibrier.", "Bitte warten...",
                 calibrationPart, 0, 0, false, "");
  renderLcdIfNeeded();

  statusLatch = -1;
  finishedLatchedThisCycle = false;
}

// =========================================================
// LOOP
// =========================================================
void loop() {
  const unsigned long now = millis();

  // ---------------------------------------------------------
  // 1) ZEITKRITISCHER PFAD
  // ---------------------------------------------------------
  muxTickCurrentPart();
  updateMotor2Jerk(now);
  updateExternalServo();
  updateButton(now);

  // ---------------------------------------------------------
  // 2) MITTLERE PRIORITÄT: Kommunikation
  // ---------------------------------------------------------
  static unsigned long lastCommMs = 0;
  if (now - lastCommMs >= 2) {
    lastCommMs = now;
    server.handleClient();
    processSerialInput();
  }

  // ---------------------------------------------------------
  // 3) NIEDRIGE PRIORITÄT / HINTERGRUND
  // ---------------------------------------------------------
  static unsigned long lastWifiPollMs = 0;
  static int stations = 0;

  if (now - lastWifiPollMs >= 100) {
    lastWifiPollMs = now;
    stations = WiFi.softAPgetStationNum();

    if (stations > 0) {
      String mac = getFirstStationMac();
      if (mac.length() > 0) {
        firstStaMacCache = mac;
      } else if (firstStaMacCache.length() == 0) {
        firstStaMacCache = "unknown";
      }
    } else {
      firstStaMacCache = "";
    }
  }

  static unsigned long lastBlueLedMs = 0;
  if (now - lastBlueLedMs >= 50) {
    lastBlueLedMs = now;

    if (stations <= 0) {
      if (now - lastBlueBlink >= LED_BLINK_MS) {
        lastBlueBlink = now;
        blueBlinkState = !blueBlinkState;
        digitalWrite(PIN_LED_BLUE, blueBlinkState ? HIGH : LOW);
      }
    } else {
      digitalWrite(PIN_LED_BLUE, HIGH);
    }
  }

  static unsigned long lastBuzzerMs = 0;
  if (now - lastBuzzerMs >= 5) {
    lastBuzzerMs = now;

    updateFinishedBeepPattern(now);

    if (!finishedBeepActive && beeping && now >= beepUntil) {
      noTone(PIN_PIEZO);
      beeping = false;
    }
  }

  // ---------------------------------------------------------
  // 4) ZUSTANDSAUTOMAT
  // ---------------------------------------------------------
  switch (state) {
    case STARTUP_CALIBRATION:
      {
        digitalWrite(PIN_LED_GREEN, LOW);
        digitalWrite(PIN_LED_RED, LOW);

        if (now - lastYellowBlink >= LED_BLINK_MS) {
          lastYellowBlink = now;
          yellowBlinkState = !yellowBlinkState;
          digitalWrite(PIN_LED_YELLOW, yellowBlinkState ? HIGH : LOW);
        }

        showStatusText(TXT_CALIB_L0, TXT_CALIB_L1, "Initiale Kalibrier.", "Bitte warten...",
                       calibrationPart, 0, 0, false, "");

        if (calibrationPart >= 0 && calibrationPart < ACTIVE_PARTS) {
          bool hallNow = readHallNow(calibrationPart);

          if (isHallStableActiveForPart(calibrationPart, hallNow)) {
            servoStop(calibrationPart);
            partCalibrated[calibrationPart] = true;

            int next = findNextUncalibratedPart(calibrationPart + 1);
            if (next >= 0) {
              calibrationPart = next;
              startCalibrationForPart(calibrationPart);
            } else {
              digitalWrite(PIN_LED_YELLOW, LOW);
              yellowBlinkState = false;
              calibrationPart = -1;

              if (stations > 0) {
                state = WAIT_ORDER;
              } else {
                state = NO_CLIENT;
              }
            }
          }
        }
      }
      break;

    case NO_CLIENT:
      {
        stopAllServos();

        digitalWrite(PIN_LED_GREEN, LOW);
        digitalWrite(PIN_LED_YELLOW, LOW);
        digitalWrite(PIN_LED_RED, LOW);
        yellowBlinkState = false;
        redBlinkState = false;

        showStatusText(TXT_NO_CLIENT_L0, TXT_NO_CLIENT_L1, TXT_NO_CLIENT_L2, TXT_NO_CLIENT_L3,
                       -1, 0, 0, false, "");

        statusLatch = -1;
        finishedLatchedThisCycle = false;

        if (stations > 0) {
          state = WAIT_ORDER;
          showStatusText(TXT_WAIT_ORDER_L0, TXT_WAIT_ORDER_L1, TXT_WAIT_ORDER_L2, TXT_WAIT_ORDER_L3,
                         -1, 0, 0, false, firstStaMacCache);
        }
      }
      break;

    case WAIT_ORDER:
      {
        stopAllServos();

        if (stations <= 0) {
          state = NO_CLIENT;
          break;
        }

        digitalWrite(PIN_LED_GREEN, LOW);
        digitalWrite(PIN_LED_YELLOW, LOW);
        digitalWrite(PIN_LED_RED, LOW);
        yellowBlinkState = false;
        redBlinkState = false;

        showStatusText(TXT_WAIT_ORDER_L0, TXT_WAIT_ORDER_L1, TXT_WAIT_ORDER_L2, TXT_WAIT_ORDER_L3,
                       -1, 0, 0, false, firstStaMacCache);

        statusLatch = -1;
        finishedLatchedThisCycle = false;

        if (orderPending) {
          orderPending = false;
          waitingForInsertConfirmationAfterCalibration = false;

          resetOrderCounters();
          for (int i = 0; i < PART_COUNT; i++) magazinWechseln[i] = 0;
          syncInitialSensorStates();

          currentPart = findNextPart(0);

          if (currentPart < 0) {
            state = FINISHED;
            break;
          }

          if (!partCalibrated[currentPart]) {
            state = CALIBRATING;
            waitingForInsertConfirmationAfterCalibration = false;
            startCalibrationForPart(currentPart);
            showStatusText(TXT_CALIB_L0, TXT_CALIB_L1, TXT_CALIB_L2, TXT_CALIB_L3,
                           currentPart, 0, targetCount[currentPart], false, firstStaMacCache);
          } else {
            startDispensingForCurrentPart();
            showStatusText(TXT_DISPENSING_L0, TXT_DISPENSING_L1, TXT_DISPENSING_L2, TXT_DISPENSING_L3,
                           currentPart, 0, targetCount[currentPart], false, firstStaMacCache);
          }
        }
      }
      break;

    case CALIBRATING:
      {
        digitalWrite(PIN_LED_GREEN, LOW);
        digitalWrite(PIN_LED_RED, LOW);

        if (now - lastYellowBlink >= LED_BLINK_MS) {
          lastYellowBlink = now;
          yellowBlinkState = !yellowBlinkState;
          digitalWrite(PIN_LED_YELLOW, yellowBlinkState ? HIGH : LOW);
        }

        showStatusText(TXT_CALIB_L0, TXT_CALIB_L1, TXT_CALIB_L2, TXT_CALIB_L3,
                       calibrationPart, totalCount[currentPart >= 0 ? currentPart : 0],
                       (currentPart >= 0 ? targetCount[currentPart] : 0), false, firstStaMacCache);

        statusLatch = -1;
        finishedLatchedThisCycle = false;

        if (calibrationPart >= 0 && calibrationPart < ACTIVE_PARTS) {
          bool hallNow = readHallNow(calibrationPart);

          if (isHallStableActiveForPart(calibrationPart, hallNow)) {
            servoStop(calibrationPart);
            partCalibrated[calibrationPart] = true;

            digitalWrite(PIN_LED_YELLOW, LOW);
            yellowBlinkState = false;

            calibrationPart = -1;

            if (waitingForInsertConfirmationAfterCalibration) {
              state = MAG_INSERT_CONFIRM;

              lastRedBlink = now;
              redBlinkState = false;
              digitalWrite(PIN_LED_RED, LOW);

              showStatusText(TXT_INSERT_CONFIRM_L0, TXT_INSERT_CONFIRM_L1,
                             TXT_INSERT_CONFIRM_L2, TXT_INSERT_CONFIRM_L3,
                             currentPart, totalCount[currentPart], targetCount[currentPart],
                             false, firstStaMacCache);
            } else {
              startDispensingForCurrentPart();

              showStatusText(TXT_DISPENSING_L0, TXT_DISPENSING_L1, TXT_DISPENSING_L2, TXT_DISPENSING_L3,
                             currentPart, totalCount[currentPart], targetCount[currentPart],
                             false, firstStaMacCache);
            }
          }
        }
      }
      break;

    case DISPENSING:
      {
        if (now - lastYellowBlink >= LED_BLINK_MS) {
          lastYellowBlink = now;
          yellowBlinkState = !yellowBlinkState;
          digitalWrite(PIN_LED_YELLOW, yellowBlinkState ? HIGH : LOW);
        }

        digitalWrite(PIN_LED_GREEN, LOW);
        digitalWrite(PIN_LED_RED, LOW);

        statusLatch = -1;
        finishedLatchedThisCycle = false;

        uint32_t cur = totalCount[currentPart];
        uint32_t tgt = targetCount[currentPart];

        showStatusText(TXT_DISPENSING_L0, TXT_DISPENSING_L1, TXT_DISPENSING_L2, TXT_DISPENSING_L3,
                       currentPart, cur, tgt, false, firstStaMacCache);

        if (currentPart >= 0 && hallChannels[currentPart] >= 0) {
          bool hallNow = readHallNow(currentPart);
          SensorState& ss = sensorState[currentPart];

          if (!hallNow) {
            ss.hallStopArmed = true;
          }

          if (ss.hallStopArmed) {
            if (isHallStableActiveForPart(currentPart, hallNow) && cur < tgt) {
              enterMagChangeForCurrentPart();
              break;
            }
          } else {
            (void)isHallStableActiveForPart(currentPart, hallNow);
          }
        }

        if (cur >= tgt) {
          servoStop(currentPart);

          int next = findNextPart(currentPart + 1);

          if (next < 0) {
            digitalWrite(PIN_LED_YELLOW, LOW);
            digitalWrite(PIN_LED_GREEN, HIGH);
            digitalWrite(PIN_LED_RED, LOW);

            showStatusText(TXT_FINISHED_L0, TXT_FINISHED_L1, TXT_FINISHED_L2, TXT_FINISHED_L3,
                           currentPart, cur, tgt, true, firstStaMacCache);

            startFinishedBeepPattern(now);

            if (!finishedLatchedThisCycle) {
              statusLatch = (int)stateToStatusCodeNum(FINISHED);
              finishedLatchedThisCycle = true;
            }

            state = FINISHED;
          } else {
            currentPart = next;

            if (!partCalibrated[currentPart]) {
              state = CALIBRATING;
              waitingForInsertConfirmationAfterCalibration = false;
              startCalibrationForPart(currentPart);

              showStatusText(TXT_CALIB_L0, TXT_CALIB_L1, TXT_CALIB_L2, TXT_CALIB_L3,
                             currentPart, totalCount[currentPart], targetCount[currentPart], false, firstStaMacCache);
            } else {
              startDispensingForCurrentPart();

              showStatusText(TXT_DISPENSING_L0, TXT_DISPENSING_L1, TXT_DISPENSING_L2, TXT_DISPENSING_L3,
                             currentPart, totalCount[currentPart], targetCount[currentPart], false, firstStaMacCache);
            }
          }
        }
      }
      break;

    case MAG_CHANGE:
      {
        if (now - lastRedBlink >= LED_BLINK_MS) {
          lastRedBlink = now;
          redBlinkState = !redBlinkState;
          digitalWrite(PIN_LED_RED, redBlinkState ? HIGH : LOW);

          if (redBlinkState && !finishedBeepActive) beepTrigger(now);
        }

        digitalWrite(PIN_LED_GREEN, LOW);
        digitalWrite(PIN_LED_YELLOW, LOW);

        showStatusText(TXT_MAG_CHANGE_L0, TXT_MAG_CHANGE_L1, TXT_MAG_CHANGE_L2, TXT_MAG_CHANGE_L3,
                       currentPart, 0, 0, false, firstStaMacCache);

        statusLatch = -1;
        finishedLatchedThisCycle = false;

        if (btnPressedEdge) {
          startMagazineChangeCalibration();

          showStatusText(TXT_CALIB_L0, TXT_CALIB_L1, TXT_CALIB_L2, TXT_CALIB_L3,
                         currentPart, totalCount[currentPart], targetCount[currentPart], false, firstStaMacCache);
        }
      }
      break;

    case MAG_INSERT_CONFIRM:
      {
        if (now - lastRedBlink >= LED_BLINK_MS) {
          lastRedBlink = now;
          redBlinkState = !redBlinkState;
          digitalWrite(PIN_LED_RED, redBlinkState ? HIGH : LOW);

          if (redBlinkState && !finishedBeepActive) beepTrigger(now);
        }

        digitalWrite(PIN_LED_GREEN, LOW);
        digitalWrite(PIN_LED_YELLOW, LOW);

        showStatusText(TXT_INSERT_CONFIRM_L0, TXT_INSERT_CONFIRM_L1,
                       TXT_INSERT_CONFIRM_L2, TXT_INSERT_CONFIRM_L3,
                       currentPart, totalCount[currentPart], targetCount[currentPart], false, firstStaMacCache);

        statusLatch = -1;
        finishedLatchedThisCycle = false;

        if (btnPressedEdge) {
          confirmNewMagazineInsertedAndResume();

          showStatusText(TXT_DISPENSING_L0, TXT_DISPENSING_L1, TXT_DISPENSING_L2, TXT_DISPENSING_L3,
                         currentPart, totalCount[currentPart], targetCount[currentPart], false, firstStaMacCache);
        }
      }
      break;

    case FINISHED:
      {
        stopAllServos();

        digitalWrite(PIN_LED_YELLOW, LOW);
        digitalWrite(PIN_LED_GREEN, HIGH);
        digitalWrite(PIN_LED_RED, LOW);

        showStatusText(TXT_FINISHED_L0, TXT_FINISHED_L1, TXT_FINISHED_L2, TXT_FINISHED_L3,
                       currentPart,
                       (currentPart >= 0 ? totalCount[currentPart] : 0),
                       (currentPart >= 0 ? targetCount[currentPart] : 0),
                       true,
                       firstStaMacCache);

        if (btnPressedEdge) {
          ledsAllOff();

          finishedBeepActive = false;
          noTone(PIN_PIEZO);
          beeping = false;

          statusLatch = -1;
          finishedLatchedThisCycle = false;

          if (stations > 0) {
            state = WAIT_ORDER;
            showStatusText(TXT_WAIT_ORDER_L0, TXT_WAIT_ORDER_L1, TXT_WAIT_ORDER_L2, TXT_WAIT_ORDER_L3,
                           -1, 0, 0, false, firstStaMacCache);
          } else {
            state = NO_CLIENT;
            showStatusText(TXT_NO_CLIENT_L0, TXT_NO_CLIENT_L1, TXT_NO_CLIENT_L2, TXT_NO_CLIENT_L3,
                           -1, 0, 0, false, "");
          }
        }

        if (orderPending) {
          state = WAIT_ORDER;
          statusLatch = -1;
          finishedLatchedThisCycle = false;
        }
      }
      break;
  }

  // ---------------------------------------------------------
  // 5) LCD wirklich nur rendern, wenn nötig
  // ---------------------------------------------------------
  renderLcdIfNeeded();
}