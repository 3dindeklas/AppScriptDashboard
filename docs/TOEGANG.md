# Toegang met Google-account of e-mailcode

Een ingevuld e-mailadres is geen bewijs dat iemand dat adres bezit. Daarom gebruikt de optionele toegang zonder Google-account een eenmalige e-mailcode. Dit werkt ook voor Microsoft 365-adressen; er is geen wachtwoord of Microsoft-koppeling nodig.

## Wat een bezoeker ziet

Zonder geldige identiteit bouwt de server alleen **Access.html** op. Index, grafieken, kaartasset en brongegevens worden dan niet verstuurd. Bij een afwijzing tijdens het laden verdwijnt ook een al opgebouwde dashboardpagina. Ontbreekt een nieuw bestand, dan blijft er een eenvoudige foutpagina over, zonder dashboardblokken.

De bestaande Google-toegang gebruikt `allowedEmails`. Een toegestaan Google-account blijft op de standaarddeployment direct werken.

Met e-mailtoegang aan vult de bezoeker een vooraf toegestaan adres in en ontvangt een zescijferige code. Die code is standaard **10 minuten** geldig, eenmalig bruikbaar en na **5 foute pogingen** geblokkeerd. Een opnieuw verstuurde code vervangt de vorige. Het antwoord verklapt niet of een ingevuld adres op de lijst staat.

Na verificatie geldt een sessie van maximaal **8 uur** vanaf het inloggen. Dat is een vaste eindtijd; gebruik verlengt de sessie niet. De knop **Uitloggen** trekt de sessie in. Bij verlopen verdwijnt het dashboard automatisch. Na het opnieuw zichtbaar maken van een tabblad controleert de app de sessie ook op de server.

## Configuratie

Voeg dit blok aan je eigen `APP_CONFIG` in **Config.gs** toe. Behoud je bestaande spreadsheet-ID’s en Google-accounts.

```javascript
emailAccess: Object.freeze({
  enabled: true,
  allowedEmails: [
    'collega@organisatie.nl',
    'andere.collega@organisatie.nl'
  ],
  codeMinutes: 10,
  sessionHours: 8
}),
```

- `enabled` staat in de repository standaard op `false`. Zonder dit blok blijft de functie uit.
- `emailAccess.allowedEmails` bevat de exacte adressen die een code mogen aanvragen. Een leeg adres, alleen een domein of een vergelijkbaar adres is onvoldoende.
- `allowedEmails` blijft de aparte lijst voor rechtstreeks herkende Google-accounts.
- `financialAllowedEmails` blijft een expliciete tweede lijst. Ook een met code geverifieerde gast ziet pas financiële cijfers als diens adres daar óók in staat. Laat deze lijst leeg als gasten geen financiële inzage mogen krijgen.
- Codegeldigheid is instelbaar van 1 tot 30 minuten; sessieduur van 1 tot 24 uur.

Het verwijderen van een gastadres of uitschakelen van e-mailtoegang blokkeert bestaande sessies bij de volgende serveraanvraag. Bestaande deployversies gebruiken hun eigen opgeslagen configuratie: publiceer dus een nieuwe versie op de betreffende URL. Een al geopende pagina kan eerder geladen gegevens niet op afstand laten vergeten; bij de eerstvolgende controle of uiterlijk de sessie-eindtijd verdwijnt de weergave.

## Deployment voor gebruikers zonder Google-account

De standaard **src/appsscript.json** blijft uitvoeren als **de bezoeker** en vraagt geen mailrecht. Google vereist dan een Google-account vóór de app kan starten. Een HTML-inlogformulier kan die platformcontrole niet omzeilen.

Voor gasten is een deployment nodig die draait als **de beheerder** en bereikbaar is voor **iedereen, ook zonder Google-login**. De app controleert daarna zelf de e-mailcode en sessie bij iedere pagina- en data-aanvraag.

Gebruik bij voorkeur een **apart Apps Script-project voor gastinzage**. Zo blijven de bestaande Google-deployment, autorisaties en configuratie apart te beheren:

1. Kopieer alle elf bestanden uit `src/`: vijf scripts en zes HTML-bestanden. Zie [INSTALLATIE.md](INSTALLATIE.md).
2. Vul de bronbladen en je eigen Google-account in; zet de gewenste gastadressen in `emailAccess.allowedEmails` en `enabled` op `true`.
3. Zet eerst `demoMode: true` om de volledige gastflow met fictieve gegevens te testen.
4. Kopieer voor dit gastproject de inhoud van **deploy/email-access/appsscript.json** naar het Apps Script-manifest. Dit voegt `script.send_mail` toe en zet de gastdeployment op `USER_DEPLOYING` / `ANYONE_ANONYMOUS`.
5. Voer als beheerder eenmaal `doGet` vanuit de editor uit en verleen de gevraagde autorisaties. Dit verstuurt geen inlogmail.
6. Maak een web-appdeployment: **Uitvoeren als: ik** en **Toegang: iedereen**. De beheerder moet de bron-Sheets kunnen lezen. Deel de bronbladen zelf niet met gasten.
7. Open de gepubliceerde **/exec**-URL in een privévenster zonder Google-login. `/dev` is alleen toegankelijk voor projecteditors en test de gasttoegang dus niet.
8. Controleer een toegestaan en een onbekend e-mailadres, een verkeerde code, opnieuw versturen, uitloggen, herladen en de financiële afscherming. Controleer ook daadwerkelijke bezorging bij Microsoft en de map ongewenste e-mail.
9. Zet na de demoacceptatie `demoMode: false` en publiceer een nieuwe versie.

Je kunt ook het bestaande project voor gasttoegang omzetten met hetzelfde gastmanifest en dezelfde instellingen. Buiten het domein kan Google dan geen actieve accountidentiteit leveren. Die gebruikers loggen met een code in en moeten daarvoor ook in `emailAccess.allowedEmails` staan. Dit verandert bovendien onder wiens rechten de bronbladen worden gelezen. Daarom is een apart gastproject de eenvoudigste manier om de bestaande Google-toegang intact te houden.

Als je organisatie geen toegang voor anonieme bezoekers toestaat, kan de Workspace-beheerder dit beperken. Alleen het inschakelen van `emailAccess` verandert de Google-deployment niet.

## Opslag en begrenzing

- Alleen de tijdelijke sessiesleutel staat in **sessionStorage**, niet in URL’s of localStorage. Workshopgegevens worden niet door deze functie op het apparaat opgeslagen. Herladen binnen hetzelfde tabblad herstelt een geldige sessie. Een browser kan sessieopslag bij tabbladherstel bewaren; de server-eindtijd blijft doorslaggevend.
- Op de server staan hashes van de codes en sessiesleutels, plus het gastadres, eindtijd en verzendtellers in Script Properties. Ruwe codes en sessiesleutels worden niet opgeslagen of gelogd.
- Per adres maximaal vijf mails per uur, per project maximaal dertig, met minstens zestig seconden tussen verzendingen. Daarboven gelden Google's eigen mailquota.
- Verlopen authenticatiegegevens worden bij het aanvragen of controleren van codes opgeruimd. Er zijn maximaal tweehonderd gelijktijdige gastsessies per project.
- Uitloggen trekt de sessie server-side in. Bij een verbindingsstoring verdwijnt de lokale sessie direct; de server-eindtijd blijft de bovengrens als de intrekking niet kan worden bezorgd.
- Script Properties en de bron-Sheets zijn alleen voor projectbeheerders. Sla geen echte adressen of sessiegegevens op in de GitHub-configuratietemplate.

## Officiële Google-documentatie

- [Web-apps en uitvoeringsidentiteit](https://developers.google.com/apps-script/guides/web)
- [Manifest: ANYONE, ANYONE_ANONYMOUS en executeAs](https://developers.google.com/apps-script/manifest/web-app-api-executable)
- [Beperkingen van het actieve gebruikersadres](https://developers.google.com/apps-script/reference/base/user)
- [MailApp en de script.send_mail-scope](https://developers.google.com/apps-script/reference/mail/mail-app)
- [Mailquota](https://developers.google.com/apps-script/guides/services/quotas)
- [Servercommunicatie en private helpers](https://developers.google.com/apps-script/guides/html/communication)

De lokale tests simuleren Google en de mailbezorging. Een echte gastdeployment en daadwerkelijke e-mailbezorging moeten nog in Apps Script worden getest.
