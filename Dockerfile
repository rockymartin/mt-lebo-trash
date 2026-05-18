FROM nginx:1.27-alpine

RUN apk add --no-cache python3

COPY scripts/build-seo.py scripts/build-seo.py
COPY site/ site/

RUN python3 scripts/build-seo.py

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY site/ /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ || exit 1
