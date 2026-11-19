# Flux privé et alertes de clôture

Le mode local produit un fichier importable. Le mode GitHub Actions conserve ce même fichier dans Git et peut envoyer une alerte à ton chat Telegram personnel. Les cours proviennent de l’API `time_series` de Twelve Data, en intervalle `1day`. [Documentation Twelve Data](https://twelvedata.com/docs)

## Générer un fichier privé

Depuis la racine du projet, avec Python 3.11 ou ultérieur et la clé dans la variable d’environnement `TWELVE_DATA_API_KEY`, lance la commande suivante. L’option `--output` permet de garder les cours hors du dépôt. Le script utilise uniquement la bibliothèque standard.

```sh
python3 scripts/market.py --output "$HOME/market.json"
```

Sans option, le script écrit dans `docs/market.json`. Le mode local ne fait aucun commit et n’envoie aucun message. Exemple de format avec des valeurs fictives :

```json
{"quotes":{"NVDA":[{"date":"2026-11-16","price":100,"fx":1.08}]},"currencies":{"NVDA":"USD"},"updated":"2026-11-17T02:37:00+00:00"}
```

Chaque série contient jusqu’à 252 séances par ordre chronologique. `price` est la clôture ajustée des splits dans la devise du titre. `fx` est la clôture de la paire EUR/devise **à la même date**. Ainsi, `price / fx` donne le prix en euros. Pour un titre en euros, `fx = 1`. Les clôtures du titre et du change peuvent avoir des horaires différents. Un change manquant fait échouer la mise à jour entière et préserve le fichier précédent. `updated` indique la dernière modification des données en UTC.

## Activer GitHub Actions

1. Place les fichiers extraits du ZIP à la racine d’un **dépôt privé**. Le workflow Pages fourni retire `market.json` du site tant que `ALLOW_PUBLIC_FEED` est désactivé. Si tu utilises un autre hébergeur, vérifie que le fichier est également exclu. Les commits gardent les versions antérieures du flux.
2. Dans **Settings → Secrets and variables → Actions**, configure les entrées ci-dessous. Autorise le workflow à écrire sur la branche par défaut pour conserver le flux et les réservations d’alerte.
3. Dans **Actions → Flux de marché → Run workflow**, sélectionne la branche par défaut. Le calendrier prévoit ensuite une exécution du mardi au samedi à 02 h 37 UTC. Le script demande les données jusqu’à la veille UTC incluse pour éviter une séance américaine en cours. Les jours fériés, une clôture déjà traitée ne redéclenche rien.

| Entrée | Type | Effet |
|---|---|---|
| `TWELVE_DATA_API_KEY` | Secret | Clé Twelve Data ayant accès aux titres et aux paires de devises concernés. |
| `WATCH_RULES` | Secret | Exemple : `{"NVDA":{"up":5,"down":3,"currency":"USD"}}`. Sans secret, cette règle s’applique. Les champs omis prennent les mêmes valeurs par défaut. |
| `STORE_MARKET_FEED` | Variable | `true` autorise le stockage dans le dépôt. Sinon seul le test s’exécute. |
| `ALLOW_PUBLIC_FEED` | Variable | `true` autorise le stockage dans un dépôt public ou interne et l’inclusion du flux dans le site Pages, même si le dépôt est privé. Vérifie les droits avant activation. |
| `ENABLE_TELEGRAM` | Variable | `true` active les envois réels. Par défaut les alertes restent désactivées. |
| `TELEGRAM_BOT_TOKEN` | Secret | Jeton du bot personnel créé avec BotFather, requis pour les envois. |
| `TELEGRAM_CHAT_ID` | Secret | Identifiant du chat destinataire. Ouvre le chat et démarre le bot avant activation. |

Vérifie que ton abonnement autorise cet usage personnel, le stockage de l’historique Git et la durée de conservation. Une diffusion à des tiers, y compris via Pages ou un canal Telegram partagé, nécessite des droits adaptés. Le consentement technique du workflow ne confère aucun droit de redistribution. [Conditions de Twelve Data](https://twelvedata.com/terms)

## Interpréter une alerte et traiter un échec

À chaque passage, le script compare les **deux dernières clôtures disponibles** dans la devise d’origine. Une variation de +5 % ou −3 % atteint les seuils par défaut, bornes incluses. La première activation évalue aussi la dernière séance. Après plusieurs jours d’arrêt, seule la dernière variation est examinée. Les taux de change servent à la valorisation en euros.

Avant chaque envoi, le workflow pousse dans `.github/market-alerts.json` la dernière date réservée pour le symbole. Une relance ou une correction de cours ne renvoie pas l’alerte du même jour. Si le push échoue, rien ne part. Si Telegram échoue après réservation, le job passe en échec et la relance saute cette alerte. Cela évite les doublons en cas de réponse perdue, au prix d’une alerte potentiellement manquée. Vérifie le chat avant toute reprise manuelle. [API Telegram](https://core.telegram.org/bots/api#sendmessage)

Consulte le job en échec dans Actions. Pour une erreur du fournisseur, vérifie la clé, la devise, les droits et le quota (une requête par symbole et une par devise distincte hors EUR). Pour un refus Git, vérifie les permissions et les protections de branche, puis relance. Un lancement qui ne modifie aucune cotation conserve le fichier et son horodatage.

## Vérification hors ligne

```sh
python3 -m unittest discover -s scripts -p 'test_market.py' -v
```

Les tests utilisent des cours fictifs, bloquent les sockets et simulent Telegram. Aucune clé ni connexion n’est nécessaire.

## Recevoir une notification pendant la séance

Pour surveiller Nvidia pendant que la Bourse est ouverte, utilise le workflow **Alertes en séance** dans un **dépôt privé**. Si ton site est public, tu peux conserver une deuxième copie privée pour la surveillance. Les notifications de séance fonctionnent indépendamment de la publication de cours et des alertes de clôture.

1. Dans Telegram, crée ton bot avec **@BotFather → /newbot**. Ouvre ensuite une conversation privée avec ce bot, appuie sur **Démarrer** et écris-lui un message. Pour retrouver ton identifiant de chat, consulte la méthode officielle [getUpdates](https://core.telegram.org/bots/api#getupdates) en local avec ton jeton. Prends le champ `message.chat.id` de ta propre conversation.
2. Dans les secrets GitHub Actions, enregistre `TWELVE_DATA_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` et `WATCH_RULES`. Depuis l’onglet Alertes du site, exporte les règles et colle le **contenu** du JSON dans ce dernier secret. Toute modification locale des seuils doit y être recopiée.
3. Crée la **variable** Actions `ENABLE_INTRADAY` avec la valeur `true`. Autorise l’écriture du workflow dans la branche principale. Lance **Actions → Alertes en séance → Run workflow** pour vérifier la configuration.
4. La planification demande un passage toutes les 30 minutes en semaine, à :13 et :43 de 08 h à 21 h UTC incluses. En France métropolitaine, cela correspond à 09 h 13–22 h 43 en hiver et 10 h 13–23 h 43 en été. Le créneau couvre la séance américaine ordinaire. Pour les places hors de ce créneau, adapte le calendrier du workflow.

Le message compare le cours courant à la clôture précédente **dans la devise du titre**. Une variation du dollar seul ne déclenche pas le seuil Nvidia. Le programme exige un marché ouvert et un cours horodaté de moins de 30 minutes. Il envoie au plus un message par titre, sens et jour après un envoi confirmé et enregistré. Si la remise est ambiguë ou si Git échoue juste après l’envoi, une relance peut doubler le message. L’heure française du cours figure dans chaque alerte. GitHub peut retarder les passages et un mouvement entre deux relevés peut passer inaperçu.

Le nombre maximal de requêtes planifiées est de 28 par jour ouvré et par titre. Vérifie le quota de l’API, l’accès aux cotations de séance et ton solde de minutes Actions avant activation. Une exécution réussie sans message est normale si aucun seuil n’a été franchi. Pour arrêter, passe `ENABLE_INTRADAY` à `false`. Pour arrêter également les alertes de clôture, passe `ENABLE_TELEGRAM` à `false`.

Si le flux est conservé en privé, télécharge le fichier brut `docs/market.json` depuis ton dépôt et importe-le dans **Cotations**. Pour une mise à jour automatique dans la page web, le fichier doit être présent sur le même site et sa diffusion autorisée. [Planification GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
