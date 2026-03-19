#!/bin/bash
# Quick preview script — opens pages based on argument
# Usage:
#   bash preview.sh        → opens both login pages
#   bash preview.sh user   → opens user login only
#   bash preview.sh admin  → opens admin login only
#   bash preview.sh dash   → opens both dashboards

APP_DIR="C:/Users/Rovin/OneDrive/Desktop/VERIFICATION_APP"

case "$1" in
  user)  start "" "$APP_DIR/index.html" ;;
  admin) start "" "$APP_DIR/admin-login.html" ;;
  dash)  start "" "$APP_DIR/user-dashboard.html"
         start "" "$APP_DIR/admin-dashboard.html" ;;
  *)     start "" "$APP_DIR/index.html"
         start "" "$APP_DIR/admin-login.html" ;;
esac
