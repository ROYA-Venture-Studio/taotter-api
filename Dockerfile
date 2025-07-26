FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Make sure your app uses this port
EXPOSE 5000

CMD ["node", "src/server.js"]

