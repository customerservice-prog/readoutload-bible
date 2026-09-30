FROM node:22-alpine
WORKDIR /app
COPY package.json server.mjs ./
COPY public ./public
COPY scripts ./scripts
COPY tests ./tests
RUN npm run check && npm test && npm run build
USER node
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.mjs"]
