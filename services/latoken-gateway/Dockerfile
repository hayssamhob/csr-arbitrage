FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .
RUN npm run build

EXPOSE 3006 8081

CMD ["npm", "start"]
