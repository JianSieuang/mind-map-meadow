#!/bin/sh
# Daily database backup: one compressed pg_dump per UTC day in /backups/daily, newest 14 kept.
# Checks hourly, so a stopped computer catches up the next time it runs. Restore with:
#   docker exec -i meadow-db pg_restore -U "$POSTGRES_USER" -d <db> --clean < backups/daily/<file>.dump
set -u
mkdir -p /backups/daily
until pg_isready -q; do sleep 5; done
while true; do
    f="/backups/daily/meadow-$(date -u +%Y-%m-%d).dump"
    if [ ! -s "$f" ]; then
        if pg_dump -Fc -f "$f.tmp"; then
            mv "$f.tmp" "$f"
            echo "backup ok: $f ($(du -h "$f" | cut -f1))"
        else
            rm -f "$f.tmp"
            echo "backup FAILED for $f"
        fi
    fi
    ls -1t /backups/daily/meadow-*.dump 2>/dev/null | tail -n +15 | xargs -r rm -f
    sleep 3600
done
