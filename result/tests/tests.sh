#!/bin/bash

set -e

echo "Esperando a que los servicios estén disponibles..."

# Esperar a que 'vote' esté disponible en el puerto 80
until timeout 1 bash -c "echo > /dev/tcp/vote/80" 2>/dev/null; do
  echo "Esperando a que vote esté listo..."
  sleep 2
done

# Esperar a que 'result' esté disponible en el puerto 80
until timeout 1 bash -c "echo > /dev/tcp/result/80" 2>/dev/null; do
  echo "Esperando a que result esté listo..."
  sleep 2
done

# Esperar a que PostgreSQL responda en 'db:5432'
until timeout 1 bash -c "echo > /dev/tcp/db/5432" 2>/dev/null; do
  echo "Esperando a que la base de datos esté lista..."
  sleep 2
done

echo "Todos los servicios están arriba. Ejecutando tests..."

# Enviar voto
curl -sS -X POST --data "vote=b" http://vote > /dev/null
sleep 10

# Ejecutar render.js con Puppeteer
if node render.js http://result; then
  echo -e "\e[42m------------"
  echo -e "\e[92mTests PASARON"
  echo -e "\e[42m------------"
  exit 0
else
  echo -e "\e[41m------------"
  echo -e "\e[91mTests FALLARON"
  echo -e "\e[41m------------"
  exit 1
fi
