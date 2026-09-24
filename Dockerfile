# =============================================================================
#  Patrimonio Inmuebles — sitio y API en una sola imagen
# =============================================================================
#  El servidor de Express ya sirve el sitio compilado si encuentra la carpeta
#  client/dist, y el cliente llama a la API con rutas relativas (/api). Asi que
#  no hacen falta dos contenedores ni un nginx delante: se compila el front en
#  una etapa, se copia junto al servidor, y queda un solo proceso escuchando.
#
#  La base es un archivo SQLite. Vive en un volumen, no dentro de la imagen:
#  si estuviera dentro, cada reconstruccion borraria los datos.
# =============================================================================

FROM node:22-alpine AS construccion-del-sitio
WORKDIR /obra
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client .
RUN npm run build


FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

#  Solo las dependencias de produccion: el servidor no necesita las de prueba.
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev

COPY server server
COPY --from=construccion-del-sitio /obra/dist client/dist

#  La base va a un volumen. La carpeta se crea aqui y se le da al usuario que
#  corre el proceso, porque no es root y no podria crearla despues.
RUN mkdir -p /datos && chown node:node /datos
ENV PATRIMONIO_DB=/datos/patrimonio.db

#  La imagen de Node ya trae un usuario 'node' sin privilegios.
USER node
EXPOSE 3001

CMD ["node", "server/index.js"]
