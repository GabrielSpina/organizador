@echo off
chcp 65001 >nul
title Organizador
cd /d "%~dp0"

rem O organizador precisa de Python com pandas e pyarrow (para os arquivos .parquet).
where python >nul 2>nul || (echo Python nao encontrado. Instale o Python 3.11 ou mais novo. & pause & exit /b 1)
python -c "import pandas, pyarrow" 2>nul || (
  echo Instalando pandas e pyarrow...
  python -m pip install --user pandas pyarrow || (echo Nao consegui instalar. & pause & exit /b 1)
)

echo Abrindo o organizador. Deixe esta janela aberta enquanto usa; fechar a janela desliga o organizador.
python servidor.py
pause
