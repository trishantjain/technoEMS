FROM node:20

RUN apt-get update && apt-get install -y ca-certificates && update-ca-certificates

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 4000
EXPOSE 5000

CMD ["node", "server_IP.js"]
