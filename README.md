# 🎯 Beihang Quiz

Application de quiz interactif en temps réel permettant à jusqu'à 17 participants de répondre simultanément à des questions et d'afficher les résultats à la fin.

## 🚀 Technologies

- **Next.js 14** - Framework React avec App Router
- **Firebase Firestore** - Base de données en temps réel
- **TypeScript** - Typage statique
- **Vercel** - Déploiement

## 📋 Prérequis

- Node.js 18+ installé
- Compte Firebase (gratuit)
- Compte GitHub
- Compte Vercel (gratuit)

## 🔧 Installation locale

1. Cloner le repository :
```bash
git clone https://github.com/VOTRE_USERNAME/beihangquizz.git
cd beihangquizz
```

2. Installer les dépendances :
```bash
npm install
```

3. Configurer Firebase :
   - Créer un projet sur [Firebase Console](https://console.firebase.google.com/)
   - Activer Firestore Database
   - Récupérer les clés de configuration
   - Créer un fichier `.env.local` à la racine avec :
```env
NEXT_PUBLIC_FIREBASE_API_KEY=votre_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=votre_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=votre_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=votre_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=votre_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=votre_app_id
```

4. Lancer le serveur de développement :
```bash
npm run dev
```

5. Ouvrir [http://localhost:3000](http://localhost:3000)

## 🌐 Déploiement sur Vercel

### Méthode 1 : Via GitHub (Recommandé)

1. **Créer le repository GitHub** :
   - Aller sur [GitHub](https://github.com)
   - Créer un nouveau repository public nommé `beihangquizz`
   - Ne pas initialiser avec README (déjà présent)

2. **Pousser le code** :
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/VOTRE_USERNAME/beihangquizz.git
git push -u origin main
```

3. **Connecter à Vercel** :
   - Aller sur [Vercel](https://vercel.com)
   - Se connecter avec GitHub
   - Cliquer sur "New Project"
   - Importer le repository `beihangquizz`
   - Configurer les variables d'environnement :
     - Ajouter toutes les variables `NEXT_PUBLIC_FIREBASE_*` depuis votre `.env.local`
   - Cliquer sur "Deploy"

4. **Votre application sera déployée automatiquement !**

### Méthode 2 : Via CLI Vercel

1. **Installer Vercel CLI** :
```bash
npm i -g vercel
```

2. **Se connecter** :
```bash
vercel login
```

3. **Déployer** :
```bash
vercel
```

4. **Ajouter les variables d'environnement** :
   - Aller sur le dashboard Vercel
   - Sélectionner votre projet
   - Settings > Environment Variables
   - Ajouter toutes les variables Firebase

## 🔥 Configuration Firebase Firestore

1. Dans Firebase Console, aller dans Firestore Database
2. Créer une base de données en mode "Test" (pour commencer rapidement)
3. Configurer les règles de sécurité :
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /sessions/{sessionId} {
      allow read, write: if true; // Pour le développement - à sécuriser en production
      
      match /participants/{participantId} {
        allow read, write: if true;
      }
    }
  }
}
```

⚠️ **Note** : Ces règles permettent l'accès libre. Pour la production, ajoutez une authentification.

## 📱 Utilisation

1. **Créer une session** :
   - Entrer votre nom
   - Laisser l'ID de session vide
   - Cliquer sur "Créer une session"
   - Vous devenez l'administrateur

2. **Rejoindre une session** :
   - Entrer votre nom
   - Entrer l'ID de session fourni par l'administrateur
   - Cliquer sur "Rejoindre"

3. **Administrateur** :
   - Cliquer sur "Commencer le quiz" pour démarrer
   - Cliquer sur "Question suivante" pour passer à la suivante
   - Les résultats s'affichent automatiquement à la fin

4. **Participants** :
   - Répondre aux questions
   - Voir les résultats en temps réel
   - Le classement s'affiche à la fin

## 🎨 Personnalisation

Vous pouvez modifier les questions dans `app/page.tsx` dans le tableau `questions`.

## 📝 Structure du projet

```
beihangquizz/
├── app/
│   ├── layout.tsx       # Layout principal
│   ├── page.tsx         # Page principale avec le quiz
│   └── globals.css      # Styles globaux
├── lib/
│   └── firebase.ts      # Configuration Firebase
├── package.json
├── tsconfig.json
├── next.config.js
└── vercel.json          # Configuration Vercel
```

## 🐛 Dépannage

- **Erreur Firebase** : Vérifiez que toutes les variables d'environnement sont correctement configurées
- **Erreur de build** : Assurez-vous d'avoir Node.js 18+
- **Problème de déploiement** : Vérifiez les logs dans Vercel Dashboard

## 📄 Licence

MIT

