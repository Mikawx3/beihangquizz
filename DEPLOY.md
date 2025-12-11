# 🚀 Guide de Déploiement sur Vercel

## Étape 1 : Préparer Firebase

1. Aller sur [Firebase Console](https://console.firebase.google.com/)
2. Cliquer sur "Ajouter un projet"
3. Nommer le projet (ex: "beihang-quiz")
4. Désactiver Google Analytics (optionnel)
5. Créer le projet

### Configurer Firestore

1. Dans le menu de gauche, cliquer sur "Firestore Database"
2. Cliquer sur "Créer une base de données"
3. Choisir "Commencer en mode test" (pour développement rapide)
4. Choisir une région (ex: europe-west)
5. Activer

### Récupérer les clés de configuration

1. Cliquer sur l'icône ⚙️ (Paramètres) > Paramètres du projet
2. Descendre jusqu'à "Vos applications"
3. Cliquer sur l'icône `</>` (Web)
4. Enregistrer l'app avec un nom (ex: "beihang-quiz-web")
5. **COPIER** toutes les valeurs de `firebaseConfig` :
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`

### Configurer les règles de sécurité Firestore

1. Aller dans Firestore Database > Règles
2. Remplacer le contenu par :
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /sessions/{sessionId} {
      allow read, write: if true;
      
      match /participants/{participantId} {
        allow read, write: if true;
      }
    }
  }
}
```
3. Publier

## Étape 2 : Créer le repository GitHub

1. Aller sur [GitHub](https://github.com)
2. Cliquer sur le "+" en haut à droite > "New repository"
3. Nom : `beihangquizz`
4. Description : "Quiz interactif en temps réel"
5. Visibilité : **Public**
6. **NE PAS** cocher "Add a README file" (déjà présent)
7. Cliquer sur "Create repository"

## Étape 3 : Pousser le code sur GitHub

Dans le terminal, depuis le dossier du projet :

```bash
# Initialiser git (si pas déjà fait)
git init

# Ajouter tous les fichiers
git add .

# Créer le premier commit
git commit -m "Initial commit - Quiz app avec Firebase"

# Renommer la branche en main
git branch -M main

# Ajouter le remote GitHub (remplacer VOTRE_USERNAME)
git remote add origin https://github.com/VOTRE_USERNAME/beihangquizz.git

# Pousser le code
git push -u origin main
```

## Étape 4 : Déployer sur Vercel

### Option A : Via l'interface web (Recommandé)

1. Aller sur [Vercel](https://vercel.com)
2. Cliquer sur "Sign Up" et se connecter avec GitHub
3. Cliquer sur "Add New..." > "Project"
4. Importer le repository `beihangquizz`
5. **Configuration du projet** :
   - Framework Preset : Next.js (détecté automatiquement)
   - Root Directory : `./` (par défaut)
   - Build Command : `npm run build` (par défaut)
   - Output Directory : `.next` (par défaut)
   - Install Command : `npm install` (par défaut)

6. **Variables d'environnement** :
   - Cliquer sur "Environment Variables"
   - Ajouter chaque variable une par une :
     ```
     NEXT_PUBLIC_FIREBASE_API_KEY = [votre apiKey]
     NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = [votre authDomain]
     NEXT_PUBLIC_FIREBASE_PROJECT_ID = [votre projectId]
     NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = [votre storageBucket]
     NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = [votre messagingSenderId]
     NEXT_PUBLIC_FIREBASE_APP_ID = [votre appId]
     ```
   - Pour chaque variable, sélectionner les environnements : Production, Preview, Development

7. Cliquer sur "Deploy"
8. Attendre la fin du déploiement (2-3 minutes)
9. Votre application sera accessible sur `https://beihangquizz.vercel.app` (ou un autre nom)

### Option B : Via CLI

```bash
# Installer Vercel CLI globalement
npm i -g vercel

# Se connecter
vercel login

# Déployer (depuis le dossier du projet)
vercel

# Suivre les instructions
# Quand demandé, ajouter les variables d'environnement une par une
```

## Étape 5 : Tester l'application

1. Ouvrir l'URL fournie par Vercel
2. Créer une session avec un nom
3. Ouvrir l'URL dans un autre onglet/navigateur
4. Rejoindre la session avec un autre nom
5. Tester le quiz !

## 🔧 Mise à jour après déploiement

À chaque fois que vous modifiez le code :

```bash
git add .
git commit -m "Description des changements"
git push
```

Vercel redéploiera automatiquement votre application !

## 📝 Notes importantes

- Les variables d'environnement sont nécessaires pour que Firebase fonctionne
- Le mode "test" de Firestore permet l'accès libre (parfait pour commencer)
- Pour la production, pensez à sécuriser les règles Firestore avec authentification
- Vercel offre un plan gratuit généreux pour ce type d'application

## 🆘 Problèmes courants

**Erreur "Firebase not initialized"** :
- Vérifiez que toutes les variables d'environnement sont bien configurées dans Vercel
- Redéployez après avoir ajouté les variables

**Erreur de build** :
- Vérifiez les logs dans Vercel Dashboard > Deployments
- Assurez-vous que Node.js 18+ est utilisé (Vercel le détecte automatiquement)

**Les données ne se synchronisent pas** :
- Vérifiez les règles Firestore
- Vérifiez la console du navigateur pour les erreurs

