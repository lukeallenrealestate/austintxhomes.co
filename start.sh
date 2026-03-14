#!/bin/bash
cd idx-search && npm install && node server.js &
cd ../austintxhomes && npm install && node server.js
