# Vervolgroadmap: planning, inzicht en rapportage

Status: roadmap vastgelegd op 22 oktober 2026. Stap 1 is uitgewerkt in de kalender-featurebranch; review/merge en praktijkacceptatie staan in [STATUS.md](STATUS.md). Stap 2–7 zijn nog niet geïmplementeerd. Dit document volgt op de [oorspronkelijke roadmap](ROADMAP.md). De bestaande [implementatiestatus](STATUS.md) blijft het overzicht van eerder gerealiseerde onderdelen; een roadmapitem is geen bewijs van implementatie of praktijkacceptatie.

Doel: eerst een praktisch planningsoverzicht maken, daarna groei, schoolbereik en opvolging inzichtelijk maken. De bestaande dashboardpagina blijft compact. Elke stap krijgt een eigen pull request, review en handmatige controle door Mathijs. De oorspronkelijke roadmap-PR bevatte alleen documentatie; de kalenderimplementatie en acceptatie worden afzonderlijk bijgehouden.

## Volgorde en resultaten

| Stap | Eigen PR | Resultaat |
| --- | --- | --- |
| 1 | Planning en kalender | Een aparte weergave met alle definitieve lesdagen, maandnavigatie en lesdetails, op dezelfde geladen dataset |
| 2 | Aandacht nodig | Een beperkt overzicht van aanvragen met ontbrekende planning of gegevens en mogelijke statusachterstand |
| 3 | Vergelijking schooljaren | Kerncijfers vergelijken met dezelfde periode van het vorige schooljaar |
| 4 | Nieuwe en terugkerende scholen | Bereik van nieuwe scholen en herhaaldeelname inzichtelijk maken |
| 5 | Van aanvraag naar uitvoering | Verdeling en verhoudingen binnen een aanvraagcohort, inclusief annuleringen |
| 6 | Bereik per workshop | Aanvragen, leerlingdeelnames, scholen en lesmomenten naast elkaar |
| 7 | Deelbaar rapport | Afdruk/PDF via de browser met gekozen onderdelen, filters, definities en actualiteit |

De weekplanning uit de eerdere voorstellen valt binnen stap 1 als compacte lijst voor mobiel en als dagdetails bij een drukke maand. Een afzonderlijke interactieve weekkalender is een mogelijke latere uitbreiding. Dekking per gemeente en bezettingsgraad staan onderaan als opties waarvoor extra gegevens nodig zijn.

## Gedeelde afspraken

- Een featurebranch begint na merge van de vorige stap op de nieuwste main. Geen gestapelde feature-PR's.
- We hergebruiken de bestaande normalisatie, bronstatus, toegangscontrole en financiële afscherming.
- De app vraagt bij het eerste openen één dataset op. Daarbij beslist de server of een snapshot bruikbaar is. Navigeren, filters wijzigen en maandwissels werken daarna op de geladen browserdata.
- Alleen expliciet vernieuwen haalt opnieuw gegevens op, inclusief de ingestelde Excel-imports. Een succesvolle vernieuwing werkt dashboard en planning samen bij.
- Een verlopen sessie wordt volgens de bestaande toegangsafhandeling vergrendeld; de kalender mag die afhandeling niet omzeilen.
- Geen contactgegevens, notities, technische bron-ID's of financiële velden toevoegen aan de kalenderpopup. Bestaande financiële rechten blijven gelden voor financiële onderdelen.
- UI-teksten spreken over tech-hubs. De optionele bronsubtitel blijft bruikbaar om datastromen te onderscheiden.
- Tellingen en nieuwe definities komen tegelijk met de betreffende feature in DATADEFINITIES.md. Onbekende waarden worden zichtbaar gemaakt en niet stilzwijgend als nul geteld.
- Nieuwe onderdelen krijgen toetsenbordbediening, een mobiele weergave en passende controle met representatieve testgegevens.

## Stap 1 — Planning en kalender

### Gebruikerservaring

De navigatie krijgt **Dashboard** en **Planning**. Planning voelt als een losse pagina: de grafieken en dashboardtegels zijn daar verborgen. De app blijft binnen dezelfde geladen web-app, bijvoorbeeld met `#dashboard` en `#planning`, zodat wisselen de pagina niet opnieuw opbouwt of een nieuwe data-aanvraag doet. Een directe opening met `#planning` laadt eerst dezelfde toegestane dataset, eenmaal.

De kalender opent standaard op de huidige maand. Bovenaan staan:

- de maand en het jaar, bijvoorbeeld **Oktober 2026**;
- **Vorige maand**, **Vandaag** en **Volgende maand**;
- een directe maand-/jaarkeuze om ook verder terug en vooruit te gaan;
- een compacte filterbediening, de actieve filters en de bestaande actualiteitsmelding;
- een korte maandsamenvatting: aantal lesdagen en geplande lesvermeldingen.

Op desktop staat een maandraster met maandag als eerste weekdag en zeven kolommen, inclusief het weekend. Vandaag is herkenbaar. Per les staat een compacte vermelding met school en workshop; een vaste kleur per aanbieder helpt herkennen. Aanbieder en status blijven ook als tekst beschikbaar zodat kleur niet de enige informatiedrager is.

Op mobiel verschijnt dezelfde maand als chronologische daglijst met dezelfde maandknoppen en lesdetails. Zo hoeven zeven smalle kolommen geen lange schoolnamen te bevatten. Dagen zonder lessen hoeven in de mobiele lijst geen ruimte in te nemen.

Een drukke dag toont enkele vermeldingen en **+ n meer**. Die knop opent de volledige daglijst, waar iedere les dezelfde details heeft. Bij gelijktijdige of gelijknamige aanvragen verdwijnen geen vermeldingen.

### Lesdetails

Een lesvermelding is bereikbaar met muis, toetsenbord en aanraking. Hover en focus tonen een klein detailvenster; klikken/tikken houdt het venster open. Escape, de sluitknop en buiten het vastgezette venster klikken sluiten het. Het venster past binnen de schermranden en blijft leesbaar wanneer de muis erheen beweegt.

| Veld | Betekenis |
| --- | --- |
| Lesdatum | De concrete lesdag waarop deze vermelding staat |
| Workshop | Workshopnaam |
| School | Schoolnaam |
| Aanbieder | De uitvoerende aanbieder |
| Deelnemers | Het geregistreerde leerlingaantal bij de aanvraag; onbekend blijft onbekend |
| Onderwijs | PO/VO en beschikbare groep/leerjaren |
| Gemeente/regio | De genormaliseerde regio uit de aanvraag |
| Tech-hub | De bron/tech-hub en, indien beschikbaar, de bijbehorende bronsubtitel |
| Status | De huidige aanvraagstatus |
| Lesreeks | Bijvoorbeeld lesdag 2 van 3, met de overige geregistreerde datums |

De huidige browserdata bevat geen locatie, begin-/eindtijd of contactgegevens. De eerste kalender presenteert lessen daarom als datumgebonden vermeldingen zonder verzonnen tijdstippen. Een uitvoeringslocatie kan later als expliciet toegestaan veld worden toegevoegd als die nodig blijkt. Geen agenda-uitnodigingen, externe kalendersynchronisatie of wijzigingen aan bronregels in deze stap.

### Welke datum en welke telling?

- Iedere geldige datum uit **Definitieve datum** wordt een afzonderlijke kalendervermelding, ook als een aanvraag meerdere maanden bestrijkt.
- Eenzelfde datum die binnen één aanvraag dubbel voorkomt levert één vermelding op die dag op. Verschillende aanvragen op dezelfde dag blijven afzonderlijk zichtbaar, ook bij dezelfde school en workshop.
- Datums worden als kalenderdatum verwerkt, zonder tijdzoneverschuiving naar de vorige of volgende dag. De Nederlandse kalender en Europe/Amsterdam bepalen vandaag.
- Een aanvraag zonder geldige definitieve datum verschijnt niet op een willekeurige dag. Een aparte melding/lijst **Nog te plannen** toont die aanvragen binnen de overige kalenderfilters.
- Geannuleerde aanvragen zijn standaard verborgen, met een expliciete optie om ze herkenbaar te tonen. Open, ingeplande en uitgevoerde aanvragen met een definitieve datum blijven zichtbaar en herkenbaar naar status.
- **Lesdagen** telt verschillende datums met een zichtbare les. **Lesvermeldingen** telt aanvraag-datumcombinaties. Beide verschillen van de geregistreerde kolom **Lesmomenten**.
- Het leerlingaantal hoort bij de aanvraag. Het bij elke lesdatum tonen betekent niet dat bij een reeks telkens andere leerlingen worden bereikt. De eerste kalender telt deze aantallen niet op tot unieke leerlingen of een nieuw bereikcijfer.
- De volgorde in een lesreeks volgt alle geldige definitieve datums van die aanvraag, niet alleen de datums in de zichtbare maand.

### Filters en hergebruik van data

Planning gebruikt eigen, herkenbare filterinstellingen voor tech-hub, aanbieder, school, gemeente/regio, PO/VO, workshop en status. Dashboardfilters en kalenderfilters blijven per weergave bewaard tijdens de sessie. De dashboarddatumslider en de keuze voor aanvraagdatum beperken de kalender niet ongemerkt: de zichtbare maand bepaalt het kalenderdatumbereik en de kalender gebruikt altijd de definitieve lesdatums.

Een schooljaarfilter is in de eerste kalender niet nodig: maand-/jaarnavigatie bepaalt de periode. Daardoor blijven lessen van een doorlopende reeks zichtbaar als de reeks over een schooljaargrens gaat. De actieve kalenderfilters staan naast de maandkeuze; **Filters wissen** verwijdert de kalenderfilters zonder de maand te veranderen.

Technisch wordt iedere aanvraag tijdelijk naar aanvraag-datumvermeldingen vertaald. Dat gebeurt op dezelfde bestaande records in het browsergeheugen, zonder een tweede serverendpoint of aparte normalisatiemethode. Een lokale sleutel mag aanvragen uit verschillende bronregels niet samenvoegen. Als voor het tonen van de bronsubtitel brononderscheid in het openbare datamodel nodig is, gebruiken we een niet-gevoelige bronsleutel en werken we de snapshotversie en projecties samen bij.

### Acceptatie en praktijktest

- Dashboard → Planning → Dashboard en twaalf maandwissels veroorzaken na de eerste laadbeurt geen extra `google.script.run`-dataverzoeken, Sheet-reads of Excel-imports.
- Openen op `#planning`, terug-/vooruitnavigatie in de browser en een ontbrekende dataset hebben een voorspelbare laad- of fouttoestand.
- Een lesreeks met drie datums over twee maanden geeft exact drie vermeldingen; een dubbele datum binnen dezelfde aanvraag telt niet dubbel.
- Twee verschillende aanvragen met dezelfde school, workshop en datum blijven twee vermeldingen.
- Jaarwisseling, februari in een schrikkeljaar en zomer-/wintertijd verplaatsen geen datum.
- Een drukke dag blijft volledig te bekijken; popups lopen niet buiten het scherm.
- Hover, focus, klik, Escape en bediening op iPad/telefoon werken zonder muisafhankelijkheid.
- Aanvragen zonder datum en geannuleerde aanvragen volgen de beschreven regels.
- Dashboardfilters verbergen niet stilzwijgend kalenderlessen; kalenderfilters en maand blijven bij terugkeer behouden.
- Na expliciet vernieuwen tonen beide weergaven dezelfde nieuwe dataset; bronfouten en verouderde gegevens blijven zichtbaar.
- Contactgegevens en notities ontbreken in popup, browserpayload en snapshot. Vergrendeling sluit ook een open lespopup.

## Stap 2 — Aandacht nodig

Doel: concrete dataproblemen en opvolgpunten vinden zonder een nieuw takenregistratiesysteem te bouwen.

In deze PR: compacte aantallen met uitklapbare lijsten voor open aanvragen zonder geldige definitieve datum, ontbrekende leerlingaantallen en ingeplande aanvragen waarvan de laatste geregistreerde lesdatum voorbij is. Een verstreken datum is een signaal **Status controleren**, geen automatische vaststelling dat de les is uitgevoerd.

Gebruik de laatste lesdatum van een reeks om lopende reeksen niet te vroeg te markeren. Geannuleerde aanvragen komen niet als opvolgtaak terug. Elk signaal toont school, workshop, aanbieder en tech-hub; meerdere signalen kunnen bij dezelfde aanvraag horen en worden als zodanig geteld. Signalen volgen de actieve filters.

Het bestaande bronveld **Actie nodig** en **Laatste contactdatum** worden nog niet publiek ontsloten: die vragen een aparte, expliciete keuze over betekenis en toegestane inhoud. Geen automatische mails of bronwijzigingen.

Acceptatie: lopende reeksen geven geen vals achterstandssignaal, onbekend leerlingaantal verschilt van een expliciete nul en één aanvraag met twee problemen wordt niet gepresenteerd als twee aanvragen.

## Stap 3 — Vergelijking met vorig schooljaar

Doel: aantallen aanvragen, leerlingdeelnames en scholen op een vergelijkbare periode beoordelen.

In deze PR: een compact vergelijkingsblok met absolute verschillen en percentages. Bij een lopend schooljaar vergelijken we tot dezelfde kalenderdatum binnen het vorige schooljaar. Bij een afgerond jaar vergelijken we de volledige schooljaren. De bestaande schooljaargrens wordt hergebruikt en gedocumenteerd. Een aangepast datumbereik krijgt expliciete vergelijkingsdatums; niet stilzwijgend een heel vorig jaar als referentie gebruiken.

De gekozen datumbasis (aanvraagdatum of definitieve lesdatum) blijft zichtbaar. Beide periodes krijgen dezelfde niet-datumfilters. De vergelijkingsperiode wordt uit alle geladen records gehaald, vóór het filter voor het geselecteerde jaar. Een schooljaaroverschrijdende lesreeks en leerlingdeelnames volgen een vooraf vastgelegde telregel, zodat geen nieuwe dubbeltellingen ontstaan.

Acceptatie: duidelijke periodeaanduiding, schrikkeldag correct behandeld, bij nul in de vorige periode **geen procentvergelijking** en bij ontbrekende bronhistorie een waarschuwing. Geen data betekent niet automatisch geen activiteit. Een toekomstige geselecteerde periode krijgt geen misleidende vergelijking tot vandaag.

## Stap 4 — Nieuwe en terugkerende scholen

Doel: tonen hoeveel scholen voor het eerst in de beschikbare historie voorkomen en hoeveel opnieuw deelnemen.

In deze PR: een compacte verdeling en een schoollijst. Normaliseer hoofdletters en witruimte en voeg zo nodig een expliciete aliaslijst toe; gebruik geen automatische fuzzy matching die locaties per ongeluk samenvoegt. Locaties blijven apart tenzij een bewuste mapping anders bepaalt.

Maak eerst een schoolidentiteit over alle geladen jaren. Classificeer een school op eerdere relevante aanvragen vóór de geselecteerde periode. De referentiehistorie wordt niet weggefilterd door de actieve periode. Toon duidelijk of terugkeer binnen dezelfde tech-hub of binnen alle tech-hubs is gemeten. Geannuleerde aanvragen bepalen geen gerealiseerd schoolbereik; de gekozen statusbasis staat bij het resultaat.

Acceptatie: één school met meerdere aanvragen telt eenmaal, aliases zijn controleerbaar, onbekende schoolnamen tellen niet als één fictieve school en **nieuw** heet **nieuw in beschikbare historie** zolang de registratie niet volledig is.

## Stap 5 — Van aanvraag naar uitvoering

Doel: de huidige uitkomst van aanvragen begrijpelijk maken.

In deze PR: een compacte stroom/verdeling met open, ingepland, uitgevoerd, geannuleerd en overige/onbekende statussen. Selecteer het cohort op aanvraagdatum; toon de huidige status van diezelfde aanvragen. Maak duidelijk wat de noemer van elk percentage is en houd annuleringen apart zichtbaar.

Met alleen de huidige status kunnen we geen historische overgangen of snelheid van bevestigen bewijzen. De visualisatie toont dus geen gemeten stap-voor-stapuitval of doorlooptijd. Oude en recente cohorten krijgen context omdat recente aanvragen nog kunnen worden ingepland.

Acceptatie: alle statusgroepen sluiten aan op hetzelfde cohorttotaal, onbekende statussen verdwijnen niet, annuleringen worden niet als uitgevoerd behandeld en de gekozen periode/noemer staat bij het blok.

## Stap 6 — Bereik per workshop

Doel: verder kijken dan alleen de meest aangevraagde workshop.

In deze PR: breid de bestaande workshopranglijst uit met een maatstafkeuze voor aanvragen, leerlingdeelnames, scholen en geregistreerde lesmomenten. Een bijbehorende tabel toont de cijfers naast elkaar. Hergebruik de bestaande component en vervang geen correcte tellingen door optelling van kalendervermeldingen.

Workshopnamen kunnen via controleerbare aliases worden samengevoegd. Een ontbrekend leerlingaantal is onbekend, niet nul; toon de volledigheid. Unieke scholen worden per workshop geteld en mogen niet zonder ontdubbeling over workshops heen worden opgeteld.

Acceptatie: maatstaf en sortering zijn herkenbaar, tabel en grafiek komen overeen, gelijke aantallen hebben een vaste volgorde en terugkerende lesdatums vermenigvuldigen het workshopbereik niet.

## Stap 7 — Deelbaar rapport

Doel: een overleg of terugkoppeling voorbereiden vanuit de bestaande selectie.

In deze PR: een rapportstand op basis van de huidige grafiekkeuze en filters, met titel, periode, geselecteerde tech-hubs, actieve filters, gegevensdatum en bron-/volledigheidsmelding. Afdrukken of bewaren als PDF loopt via de browser; geen nieuwe externe exportdienst. De kalender krijgt een eigen printbare maand-/daglijst met dezelfde actieve selectie.

Alleen zichtbare, toegestane onderdelen komen mee. Financiële informatie volgt de bestaande accountrechten. Details zoals hoverpopups worden in de printversie leesbaar verwerkt waar nodig; navigatie en bediening verdwijnen. Het rapport blijft herkenbaar als leerlingdeelnames en niet als unieke leerlingen.

Acceptatie: geen afgesneden grafieken of kalenderkolommen, bruikbare A4-pagina-einden, begrijpelijke lege selectie en dezelfde aantallen in scherm- en rapportweergave. Een rapport op basis van gedeeltelijke/verouderde brondata vermeldt dat expliciet.

## Latere opties met aanvullende gegevens

| Optie | Benodigd voordat dit betrouwbaar kan |
| --- | --- |
| Bereikte scholen als percentage per gemeente | Actuele scholenlijst met locaties, afgebakend werkgebied en betrouwbare koppeling van school aan locatie |
| Bezettingsgraad van aanbieders | Beschikbare dagen/tijdvakken, lesduur en een definitie van beschikbare capaciteit |
| Werkelijke doorlooptijd | Historische tijdstippen van ontvangst, bevestiging en statusovergangen |
| Unieke leerlingen | Een passende methode om herhaalde deelname te herkennen; de huidige leerlingaantallen volstaan niet |
| Tijdgebonden weekkalender | Expliciete begin-/eindtijden per lesdag; huidige datumvelden geven die informatie niet |

Deze opties worden niet als gerealiseerde KPI opgenomen zolang de vereiste gegevens ontbreken.

## Oplevering per stap

Iedere feature-PR beschrijft de uiteindelijke wijziging, relevante telregels en testresultaten. Werk de implementatiestatus pas bij als de code er is en houd review/merge en praktijkacceptatie apart. Controleer relevante syntax, regressies en browsergedrag; voor deze documentatie-PR volstaan inhouds- en linkcontrole. Na iedere functionele merge worden de gewijzigde Apps Script-bestanden samen bijgewerkt, een nieuwe implementatieversie gepubliceerd en de betrokken schermen in de echte omgeving getest.
