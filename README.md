# TP CRUD API - Dockerized Node.js Application

## Description
Cette application est une API CRUD conteneurisée utilisant Node.js et MariaDB.
Elle sert de base pour des TP d'intégration continue (CI/CD) et monitoring.

L'application gère les **utilisateurs** avec un modèle simple :
- `uuid` : identifiant unique
- `fullname` : nom complet
- `study_level` : niveau d'étude
- `age` : âge de l'utilisateur

Elle inclut une gestion complète des logs en JSON pour l'observabilité.

---

## Prérequis
- Docker & Docker Compose installés sur votre machine
- Node.js et npm pour le développement local (optionnel)
- Ports libres : 3000 pour l'API, 80 pour Nginx (dans le conteneur)

---

## Structure des dossiers

```
.
├── index.js                # API principale
├── package.json            # Dépendances Node.js
├── docker-compose.yml      # Docker Compose configuration
├── logs/                   # Logs persistants (JSON)
│   ├── app.log
│   ├── access.log
│   └── error.log
├── nginx/
│   └── default.conf        # Config Nginx
└── README.md
```

---

## Variables d'environnement

Crée un fichier `.env` à la racine avec les variables suivantes :

```env
PORT=3000
DB_HOST=db
DB_USER=cruduser
DB_PASS=crudpass
DB_NAME=crud_app
LOG_DIR=/var/logs/crud
NODE_ENV=production
```

---

## Lancer l'application

1. Construire et démarrer les conteneurs :

```bash
docker-compose up --build
```

2. Vérifier l'état des conteneurs :

```bash
docker ps -a
```

3. L'API devrait être accessible sur :

- Health check : `http://localhost:3000/health`
- Users API : `http://localhost:3000/api/users`

---

## Gestion des logs

Les logs sont disponibles dans le dossier **logs/** monté depuis le conteneur :

- `app.log` : logs applicatifs (CRUD, health check, erreurs) au format JSON  
- `error.log` : logs d'erreurs Node/Winston au format JSON  
- `access.log` : logs HTTP (Morgan) au format JSON pour les nouvelles requêtes  

⚠️ Les anciennes lignes de logs gardent leur ancien format texte.

---

## Endpoints API

| Méthode | Endpoint             | Description                        |
|---------|--------------------|------------------------------------|
| GET     | /api/users          | Liste tous les utilisateurs       |
| GET     | /api/users/:uuid    | Récupère un utilisateur           |
| POST    | /api/users          | Crée un nouvel utilisateur        |
| PUT     | /api/users/:uuid    | Met à jour un utilisateur         |
| DELETE  | /api/users/:uuid    | Supprime un utilisateur           |
| GET     | /health             | Vérifie le statut API et DB       |

---

## Notes pour CI/CD

- **Dockerized** : parfait pour pipelines automatisés.  
- **Logs JSON** : simplifie la collecte via ELK, Grafana, ou autre stack observabilité.  
- **Environment variables** : tout paramétrable sans changer le code.  
- **Tests unitaires** : peuvent être ajoutés pour intégration dans GitHub Actions / GitLab CI.  

---

## Commandes utiles

- Visualiser logs :

```bash
docker logs tp-crud-api-app-1      # Logs de l'application
docker logs tp-crud-api-db-1       # Logs de MariaDB
```

- Supprimer anciens logs pour repartir propre :

```bash
rm -f logs/*.log
```

- Rebuild conteneur après modification du code :

```bash
docker-compose down
docker-compose up --build -d
```

---

## Remarques

- Nginx est inclus dans le conteneur pour le reverse proxy.  
- Les logs HTTP en JSON sont générés par Morgan, les logs applicatifs par Winston.  
- L'application est prête pour CI/CD et monitoring, il suffit d'ajouter les pipelines ou outils de collecte des logs.

