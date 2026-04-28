@rem Gradle startup script for Windows

@rem Set local scope for the variables with windows NT shell
if "%OS%"=="Windows_NT" setlocal

set GRADLE_HOME=D:\web\tool\gradle-8.14.3
set JAVA_HOME=D:\web\tool\jdk-17.0.18.8-hotspot

exec "%GRADLE_HOME%\bin\gradle.bat" %*
