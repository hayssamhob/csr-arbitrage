FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev && npm install -g typescript

COPY . .
RUN npm run build

EXPOSE 3001 8080

CMD ["npm", "start"]
