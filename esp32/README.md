# ESP32

Der Code wifi_json_interface.ino stellt einen einfachen WLAN Access Point auf dem ESP32 bereit, sowie einen Webserver der per HTTP POST einen strukturierten Datensatz als json entgegennehmen kann, prüft und den Erhalt bestätigt (HTTP Code 200).
Die Werte werden anschließend als interne Variablen im ESP gespeichert.

## 1. WLAN-Setup

Der ESP initalisiert einen eigenen WLAN Access Point (AP).
Es genügt sich mit dem PC in diesen AP einzuloggen.

- Name Kommisionierautomat
- Passwort DCPS-WiSe2526
- Gateway u. IP des ESP 192.168.178.1
- Subnetzmaske 255.255.255.0

## 2. JSON

Die Daten können als json übertragen werden mit folgendem Format

### 2.1 Ausgabemenge Telegramm

Für die Ausgabemenge **WICHTIG**! Es müssen genau 5 Werte sein.

```json
{
  "wert1": 100,
  "wert2": 250,
  "wert3": 42,
  "wert4": 88,
  "wert5": 15
}
```

### 2.2 Status-Feedback Telegramm

Status-Feedback des Microcontrollers

- Abrufbar per HTTP
- System übergibt gezählte Ausgabemengen
- Systemzeit als Zeitstempel
- Status-Wert repräsentiert nachfolgende Statuscodes
-

```json
{
  "antwort_wert1": 1,
  "antwort_wert2": -1,
  "antwort_wert3": -1,
  "antwort_wert4": -1,
  "antwort_wert5": -1,
  "magazin1_wechseln": 0,
  "magazin2_wechseln": 0,
  "magazin3_wechseln": 0,
  "magazin4_wechseln": 0,
  "magazin5_wechseln": 0,
  "system_zeit": 36781,
  "status": "CODE-numerisch"
}
```

| Binärcode | Status                                    | LED           | Display                                                        | Webinterface                |
| --------- | ----------------------------------------- | ------------- | -------------------------------------------------------------- | --------------------------- | ----- |
| 0000      | Verbindungsaufbau                         | Blau blinkt   | “AP bereit, SSID: AP Kommissionierautomat, Passwort: 12345678“ | “keine Verbindung”          |
| 0001      | Gerät Verbunden und bereit für Bestellung | Blau leuchtet | „Automat Empfangsbereit“                                       | „Bereit“                    |
| 0010      | Bestellung wird bearbeitet                | Gelb leuchtet | „Bestellung wird ausgegeben ## Teil 1: 4 Stück etc. …“         | „in Arbeit“                 |
| 0011      | Bestellung abholbereit                    | Grün leuchtet | „Bestellung kann entnommen werden“                             |
| 0100      | Magazin leer oder Kaputt                  | Rot blinkt    | „Magazin XX auswechseln“                                       | Aufforderung Magazinwechsel |
| 0101      | Magazinwechsel                            | ----          | -----                                                          |                             | ----- |
| 0110      | Magazin leeren                            | ----          | -----                                                          |                             | ----- |
| 0111      | Abbruch                                   | -----         | -----                                                          |                             | ----- |
| 1000      | Alle Magazine Leer                        | Rot leuchtet  | -----                                                          | -----                       |

### 2.3 Magazin-Wechsel Telegramm

Für den Fall, dass Ausgabefeedback über den Statuscode ein Magazinwechsel signalisiert, öffnet sich eine entsprechende Anforderung an den User im Web-Interface.
Der User kann den erfolgten Magazinwechsel quittieren.

Das Bestätigungstelegramm:

- Gesendet an http://192.168.178.1/magazinwechsel per HTTP POST
- Die Variablen sind binär
- Das gewechselte Magazin wird als True = 1 repräsentiert

```json
{
  "magazin1_gewechselt": 0,
  "magazin2_gewechselt": 0,
  "magazin3_gewechselt": 0,
  "magazin4_gewechselt": 0,
  "magazin5_gewechselt": 0
}
```

## 3. Ausgabemenge senden

- Nachrich an 192.168.178.1/data
- Übertragung muss als HTTP POST stattfinden
- JSON muss im Body der Nachricht enthalten sein

Dies kann per PowerShell oder via Curl getestet werden

**Für Windows (PowerShell)**

```PowerShell
Invoke-RestMethod -Uri "http://192.168.178.1/data" -Method Post -ContentType "application/json" -Body '{"wert1": 10, "wert2": 20, "wert3": 30, "wert4": 40, "wert5": 50}'
```

**Für Linux/Mac**

```Bash
curl -X POST -H "Content-Type: application/json" -d '{"wert1":10, "wert2":20, "wert3":30, "wert4":40, "wert5": 50}}' http://192.168.178.1/data
```

## 4. Feeback über Ausgabemenge abrufen

- Nachrich an 192.168.178.1/status
- Übertragung muss als HTTP GET stattfinden
- JSON muss im Body der Nachricht enthalten sein

Dies kann per PowerShell oder via Curl getestet werden

**Für Windows (PowerShell)**

```PowerShell
Invoke-RestMethod -Uri "http://192.168.178.1/status" -Method Get
```

**Für Linux/Mac**

```Bash
curl http://192.168.178.1/status
```
