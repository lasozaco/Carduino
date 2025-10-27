const int PWM_motor1a = 25;
const int PWM_motor1b = 26;
const int frecuencia = 100;
const int canal_Motor1a = 0;
const int canal_Motor1b = 1;
const int resolucion = 8;
const int PWM_Observado = 34;
int salida = 0;

void setup() {

  Serial.begin(115200);
  pinMode(PWM_motor1a, OUTPUT);
  pinMode(PWM_motor1b, OUTPUT);

  ledcSetup(canal_Motor1a, frecuencia, resolucion);
  ledcSetup(canal_Motor1b, frecuencia, resolucion);

  ledcAttachPin(PWM_motor1a, canal_Motor1a);
  ledcAttachPin(PWM_motor1b, canal_Motor1b);

  ledcWrite(canal_Motor1a, 128);
  ledcWrite(canal_Motor1b, 0);

}

void loop () {

  ledcWrite(canal_Motor1a, 255);
  ledcWrite(canal_Motor1b, 0);

}