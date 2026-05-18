FROM nginx:1.27-alpine

RUN apk add --no-cache python3

WORKDIR /app

COPY scripts/build-seo.py scripts/build-seo.py
COPY site/ site/

# Generate SEO pages into /app/site, then copy into nginx docroot.
# Do NOT "COPY site/" again after RUN — that re-copies from git context and
# drops gitignored outputs (schedule/, pickup/, sitemap.xml, street-slugs.json).
RUN python3 scripts/build-seo.py && \
    mkdir -p /usr/share/nginx/html && \
    cp -a site/. /usr/share/nginx/html/

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ || exit 1
