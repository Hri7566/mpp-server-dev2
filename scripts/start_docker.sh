#!/usr/bin/env bash

docker build --pull -t mpp-server-dev2 . && docker run -p 8443:8443 mpp-server-dev2
