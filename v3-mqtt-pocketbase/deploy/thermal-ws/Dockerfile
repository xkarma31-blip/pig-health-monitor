FROM node:20-slim

WORKDIR /app

COPY package.json .
RUN npm install --production

COPY thermal-ws.js .

EXPOSE 8080

CMD ["node", "thermal-ws.js"]
