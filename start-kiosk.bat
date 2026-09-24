@echo off
rem Projector / Kinect wall: start the local server, then open the app full screen in
rem Chrome with sound allowed straight away (nobody clicks on a wall to start it).
rem Close with Alt+F4.
start "Jungle Wall server" /min node serve.mjs
timeout /t 2 /nobreak >nul
start "" chrome --kiosk --autoplay-policy=no-user-gesture-required --noerrdialogs --disable-session-crashed-bubble http://localhost:8080
