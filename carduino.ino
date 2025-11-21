#include <Arduino.h>
#include <ESP32Servo.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

/* ===== Pines según tu conexión ===== */
#define IN1       25      // L298N IN1
#define IN2       26      // L298N IN2
#define TRIG      19      // HC-SR04 TRIG (Vcc 5V)
#define ECHO      18      // HC-SR04 ECHO (ideal con divisor)
#define SERVO_PIN 33      // Servo dirección

#define SDA_PIN   21      // MPU6050 SDA
#define SCL_PIN   22      // MPU6050 SCL

/* ===== Servo ===== */
Servo steering;
const int SERVO_CENTER = 90;
const int SERVO_UTURN  = 180;   // ángulo de giro para la U

/* ===== Velocidades ===== */
const int SPEED_FAST = 85;      // % rápido
const int SPEED_SLOW = 30;      // % lento
const int SPEED_TURN = 60;      // % durante la U (estable)

/* ===== Detección (ultrasónico) ===== */
const float THRESH_CM = 20.0;           // cm para considerar “objeto”
const unsigned long COOLDOWN_MS = 1000; // anti-rebote (1 s)
const unsigned long U_HOLD_MS   = 6000; // mantener 180° (5–8 s recomendado)

/* ===== Estado general ===== */
int objetos = 0;
bool obstPrev = false;
unsigned long lastHit = 0;
int currentSpeedPct = SPEED_FAST; // velocidad “latcheada” (se conserva)

/* ===== MPU6050 ===== */
Adafruit_MPU6050 mpu;
bool mpuOk = false;
unsigned long lastMPUPrint = 0;
const unsigned long MPU_PRINT_INTERVAL = 200; // ms

/* ===== Utilidades ===== */
int pctToPWM(int p){
  p = constrain(p, 0, 100);
  return map(p, 0, 100, 0, 255);
}

void motorForward(int pct){
  int pwm = pctToPWM(pct);
  analogWrite(IN1, pwm);  // Igual que en tu código original
  digitalWrite(IN2, LOW); // Un solo sentido
}

void motorStop(){
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
}

/* Lectura ultrasónica robusta (mediana de N) */
static float medirUna(){
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);

  unsigned long us = pulseInLong(ECHO, HIGH, 60000UL);
  if (us == 0) return -1.0f;

  float cm = us * 0.0343f / 2.0f;
  if (cm < 2.0f || cm > 400.0f) return -1.0f;
  return cm;
}

static float mediana(float *v, int n){
  for (int i = 0; i < n - 1; i++) {
    for (int j = i + 1; j < n; j++) {
      if (v[j] < v[i]) {
        float t = v[i];
        v[i] = v[j];
        v[j] = t;
      }
    }
  }
  if (n % 2) return v[n / 2];
  return 0.5f * (v[n / 2 - 1] + v[n / 2]);
}

float leerDistanciaCm(){
  const int N = 5;
  float vals[N];
  int k = 0;

  for (int i = 0; i < N; i++) {
    float d = medirUna();
    if (d > 0) vals[k++] = d;
    delay(15);
  }

  if (k == 0) return 9999.0f;
  return mediana(vals, k);
}

/* ===== Lectura del MPU6050 ===== */
void leerMPU(){
  if (!mpuOk) return;

  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  unsigned long now = millis();
  if (now - lastMPUPrint >= MPU_PRINT_INTERVAL) {
    lastMPUPrint = now;
    Serial.printf("MPU -> Accel (X: %.2f, Y: %.2f, Z: %.2f) m/s^2 | "
                  "Gyro (X: %.2f, Y: %.2f, Z: %.2f) rad/s | Temp: %.2f C\n",
                  a.acceleration.x, a.acceleration.y, a.acceleration.z,
                  g.gyro.x,        g.gyro.y,        g.gyro.z,
                  temp.temperature);
  }
}

/* ===== Setup ===== */
void setup(){
  Serial.begin(115200);
  delay(500);

  /* --- Motor / L298N --- */
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  motorStop();  // motor apagado desde el arranque

  /* --- Ultrasonico --- */
  pinMode(TRIG, OUTPUT);
  digitalWrite(TRIG, LOW);
  pinMode(ECHO, INPUT_PULLDOWN); // ayuda a evitar falsos altos

  /* --- Servo --- */
  steering.setPeriodHertz(50);
  steering.attach(SERVO_PIN, 500, 2400); // ancho de pulso típico
  steering.write(SERVO_CENTER);

  /* --- MPU6050 --- */
  Wire.begin(SDA_PIN, SCL_PIN);  // I2C por los pines 21/22

  if (!mpu.begin()) {
    Serial.println("⚠️ No se detecta MPU6050. Revisa conexiones (3.3V, SDA=21, SCL=22, GND).");
    mpuOk = false;
  } else {
    mpuOk = true;
    Serial.println("✅ MPU6050 detectado correctamente.");

    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  }

  Serial.println("Inicio: velocidad=Rápida, conteo=0");
}

/* ===== Loop ===== */
void loop(){
  float d = leerDistanciaCm();
  bool obstAhora = (d <= THRESH_CM);
  unsigned long now = millis();

  // Mantén SIEMPRE la velocidad actual (latcheada)
  motorForward(currentSpeedPct);

  // Leer y mostrar datos del giroscopio / acelerómetro
  leerMPU();

  // Info al Serial del ultrasonico + estado
  Serial.printf("Distancia: %.1f cm | Objetos: %d | Velocidad: %s (%d%%)\n",
    d, objetos, (currentSpeedPct == SPEED_FAST ? "Rápida" : "Lenta"), currentSpeedPct);

  // Flanco de subida + cooldown => nueva detección
  if (obstAhora && !obstPrev && (now - lastHit > COOLDOWN_MS)) {
    objetos++;
    lastHit = now;
    Serial.printf("🟢 Objeto %d detectado\n", objetos);

    // Alternar velocidad y mantenerla hasta la próxima
    currentSpeedPct = (currentSpeedPct == SPEED_FAST) ? SPEED_SLOW : SPEED_FAST;
    Serial.printf("↔️ Cambio de velocidad -> %s (%d%%)\n",
      (currentSpeedPct == SPEED_FAST ? "Rápida" : "Lenta"), currentSpeedPct);

    // En el 6º objeto: U completa (servo a 180°, mantener, recentrar, reset)
    if (objetos == 6) {
      Serial.println("🚗 OBJETO #6: Giro en U (servo a 180°, mantener y recentrar)");

      int speedBackup = currentSpeedPct; // recuerda la velocidad actual
      steering.write(SERVO_UTURN);

      unsigned long t0 = millis();
      while (millis() - t0 < U_HOLD_MS) {
        motorForward(SPEED_TURN); // velocidad de giro estable
        leerMPU();                // seguimos leyendo giroscopio durante la maniobra
        delay(20);
      }

      // Terminar U: centrar y restaurar velocidad "latcheada"
      steering.write(SERVO_CENTER);
      currentSpeedPct = speedBackup;
      objetos = 0; // reinicia conteo
      Serial.println("✅ U completada: servo centrado, conteo=0");
    }
  }

  obstPrev = obstAhora;
  delay(60);
}