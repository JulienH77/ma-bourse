# Folio — portefeuille boursier en euros

Une interface française pour consigner les ordres exécutés sur Revolut, visualiser les cours et suivre la performance en euros. Le dossier `docs` contient un site statique, sans installation de dépendances ni compte à créer.

## Essayer

Ouvrir `docs/index.html` après extraction du ZIP pour parcourir la démo. Pour une utilisation locale durable, depuis le dossier du projet, lancer `python -m http.server 8000 --directory docs` puis ouvrir http://localhost:8000. Réutiliser la même adresse et le même navigateur. Le stockage des URL file:// dépend du navigateur.

## Mettre le site sur GitHub

1. Créer un dépôt GitHub. Extraire le ZIP et y déposer le **contenu** en conservant les chemins, notamment `docs/index.html` et `.github/workflows/`. Un client Git transfère aussi le dossier caché.
2. Dans **Settings → Pages → Build and deployment**, choisir **GitHub Actions**. Dans **Actions → Publier Folio → Run workflow**, lancer une première publication sur la branche principale. Les mises à jour suivantes de la branche main ou master sont publiées automatiquement.
3. Ouvrir le lien fourni par GitHub Pages. Le site et ses sources peuvent être publics. Les transactions saisies dans le navigateur restent sur cet appareil. Éviter de déposer une sauvegarde personnelle dans le dépôt.

## Saisir un ordre

Utiliser la quantité exécutée, le prix par action dans sa devise et le taux exprimé en unités de cette devise pour un euro. Pour 1 € = 1,10 $, saisir 1,10. Pour une action en euros, le taux vaut 1. Les frais sont exprimés en euros. Une commission de 1,10 $ au taux de 1,10 vaut 1 €. Si des frais de change sont déjà compris dans le taux effectif, ne pas les ajouter une seconde fois.

L’aide **De Revolut au portefeuille** (`docs/guide.html`) contient un calculateur de taux et un exemple chiffré.

## Cours et alertes

Le mode manuel fonctionne sans abonnement. Saisir un point de cours et son change pour chaque date utile. Les cours de la démonstration sont simulés. Pour alimenter la surveillance en cours de clôture et recevoir les messages Telegram lorsque le navigateur est fermé, suivre [ALERTES.md](ALERTES.md). La publication Pages exclut le fichier de cours tant que la variable ALLOW_PUBLIC_FEED ne vaut pas true, même si le dépôt GitHub est privé. Les opérations réelles ne sont jamais nécessaires au programme de surveillance.

## Conservation

Les données sont liées à l’adresse du site, au navigateur et à l’appareil. Exporter une sauvegarde JSON après les saisies importantes. Pour migrer d’un aperçu vers GitHub Pages ou vers un autre téléphone, exporter puis importer la sauvegarde. Une fenêtre de navigation privée ou l’effacement des données du navigateur peut supprimer les saisies.

## Périmètre financier

Valeur des titres en euros, achats et ventes, frais saisis, change et coût de revient moyen. Les liquidités, dividendes, fiscalité et ajustements automatiques des divisions d’actions sont hors périmètre. La valeur de marché estimée ne constitue pas un prix d’exécution garanti. Après une opération sur titre, vérifier les quantités et l’historique auprès du courtier.

Pour les mouvements rapides, le workflow **Alertes en séance** peut interroger les cours toutes les 30 minutes sur les jours et plages configurés. Les alertes de séance et de clôture s’activent séparément. La documentation peut aussi être lue directement dans le navigateur via `docs/alerts-guide.html`.

Tests locaux (depuis la racine du dépôt) : `node --test tests/*.test.js` et `python -m unittest discover -s scripts`.

### Actualiser un titre depuis le navigateur

Dans **Réel → Cotations → Actualiser un titre**, sélectionne un symbole détenu et saisis ta clé Twelve Data personnelle. La clé sert seulement à ce chargement, via HTTPS, et n’est pas sauvegardée. Les données sont fusionnées sur ton appareil. Cette option fonctionne indépendamment de la publication d’un flux par GitHub. Le fournisseur reçoit le symbole et, si nécessaire, la paire de devises. En cas de quota, de blocage réseau ou de couverture insuffisante, l’import de fichier reste disponible.
