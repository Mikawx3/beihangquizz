# 🔍 Guide de Débogage Firebase

## Comment vérifier que Firebase fonctionne

### 1. Vérifier les variables d'environnement sur Vercel

1. Aller sur votre dashboard Vercel
2. Sélectionner le projet `beihangquizz`
3. Aller dans **Settings** > **Environment Variables**
4. Vérifier que toutes ces variables sont présentes :
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`

⚠️ **Important** : Après avoir ajouté/modifié des variables, il faut **redéployer** le projet !

### 2. Vérifier dans la console du navigateur

1. Ouvrir votre application déployée
2. Appuyer sur **F12** (ou Cmd+Option+I sur Mac) pour ouvrir les outils de développement
3. Aller dans l'onglet **Console**
4. Vous devriez voir :
   - `✅ Firebase initialisé avec le projet: [votre-project-id]`
   - `📝 Ajout du participant: [nom] dans la session: [session-id]`
   - `✅ Participant ajouté avec succès`
   - `👂 Écoute des participants pour la session: [session-id]`
   - `📊 Participants mis à jour: X participant(s)`

### 3. Vérifier dans Firebase Console

1. Aller sur [Firebase Console](https://console.firebase.google.com/)
2. Sélectionner votre projet
3. Aller dans **Firestore Database**
4. Vous devriez voir une collection `sessions` avec :
   - Des documents de session (ID aléatoire)
   - Sous chaque session, une sous-collection `participants` avec les noms des participants

### 4. Vérifier les règles Firestore

1. Dans Firebase Console > Firestore Database > **Règles**
2. Les règles doivent être :
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
3. Cliquer sur **Publier** si vous avez modifié les règles

### 5. Problèmes courants

#### ❌ "Firebase not initialized"
- **Cause** : Variables d'environnement manquantes ou incorrectes
- **Solution** : Vérifier les variables sur Vercel et redéployer

#### ❌ "Permission denied"
- **Cause** : Règles Firestore trop restrictives
- **Solution** : Vérifier les règles dans Firebase Console

#### ❌ Les participants n'apparaissent pas
- **Cause 1** : Le listener n'est pas actif
- **Solution** : Vérifier la console du navigateur pour les logs
- **Cause 2** : Les données ne sont pas écrites
- **Solution** : Vérifier dans Firebase Console si les documents existent

#### ❌ "Missing or insufficient permissions"
- **Cause** : Les règles Firestore bloquent l'accès
- **Solution** : Utiliser les règles de test (voir section 4)

### 6. Test manuel

1. **Créer une session** :
   - Ouvrir l'application dans un onglet
   - Entrer un nom (ex: "Admin")
   - Laisser l'ID de session vide
   - Cliquer sur "Créer une session"
   - Noter l'ID de session affiché

2. **Rejoindre la session** :
   - Ouvrir l'application dans un **nouvel onglet** (ou un autre navigateur)
   - Entrer un autre nom (ex: "Participant1")
   - Entrer l'ID de session noté précédemment
   - Cliquer sur "Rejoindre"

3. **Vérifier** :
   - Dans le premier onglet (Admin), vous devriez voir "Participant1" dans la liste
   - Dans Firebase Console, vous devriez voir les deux participants dans la sous-collection `participants`

### 7. Logs de débogage

Le code ajoute maintenant des logs dans la console :
- `✅ Firebase initialisé` : Firebase est bien configuré
- `📝 Ajout du participant` : Tentative d'ajout d'un participant
- `✅ Participant ajouté` : Participant ajouté avec succès
- `👂 Écoute des participants` : Le listener est actif
- `📊 Participants mis à jour` : Nouveau participant détecté
- `❌ Erreur` : Une erreur s'est produite

Si vous ne voyez pas ces logs, vérifiez :
1. Que la console du navigateur est ouverte
2. Que les filtres de la console ne masquent pas les logs
3. Que JavaScript n'est pas désactivé


