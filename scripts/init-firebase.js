// Script pour initialiser les données Firebase
// Utilisation: node scripts/init-firebase.js

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json'); // Vous devrez créer ce fichier

// Initialiser Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function initFirebase() {
  try {
    console.log('🚀 Initialisation de Firebase...');

    // 1. Créer le mot de passe admin par défaut
    const adminRef = db.collection('admin').doc('config');
    const adminDoc = await adminRef.get();
    
    if (!adminDoc.exists) {
      await adminRef.set({
        password: 'admin123'
      });
      console.log('✅ Mot de passe admin créé: admin123');
    } else {
      console.log('ℹ️ Mot de passe admin existe déjà');
    }

    // 2. Créer quelques questions par défaut
    const questionsRef = db.collection('questions');
    const questionsSnapshot = await questionsRef.get();
    
    if (questionsSnapshot.empty) {
      const defaultQuestions = [
        {
          id: 1,
          question: 'Quelle est la capitale de la France ?',
          options: ['Lyon', 'Marseille', 'Paris', 'Toulouse'],
          correct: 2,
        },
        {
          id: 2,
          question: 'Quel est le plus grand océan ?',
          options: ['Atlantique', 'Pacifique', 'Indien', 'Arctique'],
          correct: 1,
        },
        {
          id: 3,
          question: 'Combien de continents y a-t-il sur Terre ?',
          options: ['5', '6', '7', '8'],
          correct: 2,
        },
        {
          id: 4,
          question: 'Quel est le langage de programmation le plus populaire ?',
          options: ['Python', 'JavaScript', 'Java', 'C++'],
          correct: 1,
        },
        {
          id: 5,
          question: 'Quelle est la vitesse de la lumière ?',
          options: ['300 000 km/s', '150 000 km/s', '450 000 km/s', '600 000 km/s'],
          correct: 0,
        },
      ];

      for (const question of defaultQuestions) {
        await questionsRef.doc(String(question.id)).set({
          question: question.question,
          options: question.options,
          correct: question.correct,
        });
      }
      console.log(`✅ ${defaultQuestions.length} questions par défaut créées`);
    } else {
      console.log('ℹ️ Des questions existent déjà');
    }

    console.log('✅ Initialisation terminée avec succès!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

initFirebase();


