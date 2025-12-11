# Guide d'initialisation manuelle de Firebase

## Option 1 : Via Firebase Console (Recommandé - Plus simple)

### 1. Créer le mot de passe admin

1. Aller sur [Firebase Console](https://console.firebase.google.com/)
2. Sélectionner votre projet `beihangquizz`
3. Aller dans **Firestore Database**
4. Cliquer sur **Commencer la collection**
5. Collection ID: `admin`
6. Document ID: `config` (ou laisser auto-généré puis renommer)
7. Ajouter un champ:
   - Champ: `password`
   - Type: `string`
   - Valeur: `admin123`
8. Cliquer sur **Enregistrer**

### 2. Créer les questions par défaut

1. Dans Firestore Database, cliquer sur **Commencer la collection**
2. Collection ID: `questions`
3. Pour chaque question, créer un document avec l'ID numérique (1, 2, 3, etc.)

#### Question 1:
- Document ID: `1`
- Champs:
  - `question` (string): `Quelle est la capitale de la France ?`
  - `options` (array): `["Lyon", "Marseille", "Paris", "Toulouse"]`
  - `correct` (number): `2`

#### Question 2:
- Document ID: `2`
- Champs:
  - `question` (string): `Quel est le plus grand océan ?`
  - `options` (array): `["Atlantique", "Pacifique", "Indien", "Arctique"]`
  - `correct` (number): `1`

#### Question 3:
- Document ID: `3`
- Champs:
  - `question` (string): `Combien de continents y a-t-il sur Terre ?`
  - `options` (array): `["5", "6", "7", "8"]`
  - `correct` (number): `2`

#### Question 4:
- Document ID: `4`
- Champs:
  - `question` (string): `Quel est le langage de programmation le plus populaire ?`
  - `options` (array): `["Python", "JavaScript", "Java", "C++"]`
  - `correct` (number): `1`

#### Question 5:
- Document ID: `5`
- Champs:
  - `question` (string): `Quelle est la vitesse de la lumière ?`
  - `options` (array): `["300 000 km/s", "150 000 km/s", "450 000 km/s", "600 000 km/s"]`
  - `correct` (number): `0`

## Option 2 : Via l'application web (Automatique)

1. Aller sur `/admin` de votre application
2. Se connecter avec le mot de passe par défaut (si configuré) ou créer le mot de passe admin d'abord
3. Le panneau admin créera automatiquement le mot de passe admin s'il n'existe pas
4. Ajouter les questions via l'interface

## Option 3 : Via le panneau admin directement

1. Aller sur `/admin`
2. Si le mot de passe n'existe pas encore, il sera créé automatiquement avec `admin123`
3. Utiliser l'interface pour ajouter les questions

## Structure Firestore attendu Après l'initialisation, votre Firestore devrait ressembler à :

```
beihangquizz/
├── admin/
│   └── config/
│       └── password: "admin123"
└── questions/
    ├── 1/
    │   ├── question: "..."
    │   ├── options: [...]
    │   └── correct: 2
    ├── 2/
    │   └── ...
    └── ...
```

## Vérification

Après l'initialisation, vérifiez que :
1. La collection `admin` existe avec le document `config`
2. La collection `questions` existe avec au moins quelques questions
3. Vous pouvez vous connecter au panneau admin avec le mot de passe

