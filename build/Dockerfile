FROM ubuntu:focal

RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y curl git nodejs npm

RUN npm install -g pnpm pm2

WORKDIR /app

COPY buildSetupScript.sh /app/buildSetupScript.sh
RUN chmod +x /app/buildSetupScript.sh

ENTRYPOINT ["/app/buildSetupScript.sh"]
