# Compact dashboard en screenshots

## Introductie en schooljaar

Het introductieblok toont **Grip op bereik, planning en impact.**, de modus, het bijgewerktijdstip en de actieve selectie met het aantal zichtbare workshops. Zo blijft de context ook bij een ingeklapte zijbalk en op screenshots zichtbaar.

De schooljaarknoppen gebruiken de schooljaren uit de geladen gegevens, met het nieuwste eerst. **Alle schooljaren** neemt ook regels zonder bekend schooljaar mee. De knoppen en het schooljaarfilter in de zijbalk werken synchroon. Een schooljaarwissel behoudt alle andere filters, waaronder de ingestelde periode en leerlingaantallen. **Filters wissen** herstelt ook de schooljaarkeuze.

## Filters

De filters staan standaard ingeklapt. Open **Filters** in de navigatie om de zijbalk te tonen. Op desktop staan de filters naast het dashboard; op kleinere schermen verschijnen ze erboven. Een getal naast de knop toont hoeveel filtergroepen actief zijn.

Filteren werkt direct. Sluiten of inklappen met Escape verandert de selectie niet. De tekst boven de kerncijfers houdt de actieve selectie en periode in beeld, ook voor een screenshot. **Filters wissen** herstelt de volledige gegevensselectie en laat de gekozen zichtbare onderdelen ongemoeid.

## Data

Open **Data** voor het brede bronoverzicht. Daar staan:

- het tijdstip waarop de brongegevens zijn ingelezen;
- de herkomst: **Google Sheets** of **Snapshot**;
- de gemeten laadtijd;
- de status en datakwaliteit per tech-hub;
- **Brongegevens vernieuwen** om de snapshot bewust te vervangen;
- de kaartbron en licentie onder **Kaartbronnen en licentie**.

Boven het dashboard blijft alleen de modus en een korte bijgewerkt-regel zichtbaar. Een laadfout of onvolledig resultaat blijft wel direct in het dashboard gemeld.

## Weergave kiezen

Open **Weergave** en vink de onderdelen aan die je wilt laten zien. Je kunt kerncijfers, maandgrafiek, gemeenten, PO/VO, statusgroepen, workshops, aanbieders, leerjaren, recente workshops en de vergelijking afzonderlijk tonen of verbergen.

De financiële optie verschijnt alleen voor een account met financieel recht. **Alles tonen** verandert die toegangscontrole niet.

Om bijvoorbeeld alleen bereik en status te delen:

1. Stel de gewenste tech-hub, periode en overige filters in.
2. Laat onder **Weergave** alleen **Kerncijfers**, **PO / VO-verdeling** en **Statusgroepen** aangevinkt.
3. Sluit het menu en klap de filters in.
4. Controleer de selectietekst boven de grafieken.
5. Maak je screenshot, of gebruik **Afdrukken / PDF** voor dezelfde selectie.

De keuze blijft behouden tijdens filteren en handmatig vernieuwen. Ze geldt alleen voor de huidige pagina en wordt niet als instelling of data op het apparaat opgeslagen. Na een volledige paginaherlaadactie staan alle beschikbare onderdelen weer aan. Met **Alles tonen** herstel je de weergave zonder opnieuw te laden.

## Samengevoegde onderdelen

**Gemeenten en regio’s** toont de kaart en de regionale staafgrafiek tegelijk. De staven staan onder de uitleg over het werkgebied. Op desktop groeit de kaart mee met de hoogte van deze kolom, ook bij het openen van de cijfertabel. Op kleinere schermen staan de kaart en de toelichting met staven onder elkaar. Beide gebruiken dezelfde actieve gegevensselectie; de kaarttabel maakt daarnaast duidelijk welke regio’s niet aan een gemeente zijn gekoppeld.

**Bereik in PO en VO** combineert twee taartdiagrammen: PO-groepen en VO-leerjaren, met vaste heldere kleuren per leerjaar, gewogen aanvragen en percentages. De uitleg over combinatiegroepen staat onderaan datzelfde blok. De PO/VO-sectorverdeling blijft een afzonderlijke donut.

De twee leerjaargrafieken hebben op desktop dezelfde hoogte en delen één **Bekijk cijfers als tabel**-knop voor beide tabellen. Het gemeentevak heeft één tabelknop voor alle gemeenteaantallen. Laad- en foutmeldingen staan boven het introductieblok.

**Tech-hubs naast elkaar** staat onderaan de pagina en kan ook via Weergave verborgen worden.

## Toetsenbord

De menu’s gebruiken native details/summary en de keuzelijsten en vinkjes blijven native invoervelden. Tab beweegt tussen de bedieningselementen; Enter opent een menu. Escape sluit menu’s en filters en brengt de focus terug naar de betreffende knop.

### Laadstatus en herkomst

Tijdens laden vervagen de dashboardblokken; na succes of een fout worden ze weer volledig zichtbaar. Bij verminderde beweging vervalt de overgang. De badge toont **Snapshot gebruikt** wanneer de gedeelde cache is gelezen. Onder Data staat dan dat de bronnen niet opnieuw zijn ingelezen. Na opnieuw inlezen vermeldt Herkomst of de snapshot is opgeslagen, uitgeschakeld, bezet of mislukt. Bij een gedeeltelijk resultaat kan een vorige volledige snapshot behouden blijven. Een cache is tijdelijk: een volgende opening kan de bronnen opnieuw moeten lezen.

Met `sources[].subtitle` (bijvoorbeeld `jaar 25/26`) onderscheid je bronkaarten. De naam van de tech-hub en de filtergroepering blijven gelijk.
