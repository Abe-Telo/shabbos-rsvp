from pathlib import Path

p = Path("/etc/apache2/sites-enabled/upgradeprokeys-le-ssl.conf")
text = p.read_text()
if "shabbos-api" in text:
    print("already present")
else:
    needle = "    DocumentRoot /srv/orderassist/keys-root"
    insert = (
        needle
        + "\n\n"
        + "    ProxyPreserveHost On\n"
        + "    ProxyPass /shabbos-api/ http://127.0.0.1:3055/\n"
        + "    ProxyPassReverse /shabbos-api/ http://127.0.0.1:3055/"
    )
    if needle not in text:
        raise SystemExit("needle missing")
    p.write_text(text.replace(needle, insert, 1))
    print("updated")
