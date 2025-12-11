'use client';

import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  deleteDoc,
  updateDoc,
} from 'firebase/firestore';
import { useRouter } from 'next/navigation';

interface Question {
  id: string;
  question: string;
  options: string[];
  type?: 'multiple-choice' | 'ranking';
}

export default function SurveysList() {
  const router = useRouter();
  const [surveys, setSurveys] = useState<any[]>([]);
  const [newSurveyName, setNewSurveyName] = useState('');

  // Charger tous les sondages
  const loadSurveys = useCallback(async () => {
    try {
      const surveysRef = collection(db, 'surveys');
      const snapshot = await getDocs(surveysRef);
      const loadedSurveys: any[] = [];
      snapshot.forEach((doc) => {
        loadedSurveys.push({ id: doc.id, ...doc.data() });
      });
      setSurveys(loadedSurveys);
    } catch (error) {
      console.error('Erreur lors du chargement des sondages:', error);
    }
  }, []);

  useEffect(() => {
    loadSurveys();
  }, [loadSurveys]);

  // Créer un nouveau sondage
  const handleCreateSurvey = async () => {
    if (!newSurveyName.trim()) {
      alert('Veuillez entrer un nom pour le sondage');
      return;
    }

    try {
      const surveyId = `survey_${Date.now()}`;
      const surveyRef = doc(db, 'surveys', surveyId);
      await setDoc(surveyRef, {
        name: newSurveyName.trim(),
        createdAt: new Date(),
      });
      setNewSurveyName('');
      await loadSurveys();
      router.push(`/admin/surveys/${surveyId}`);
    } catch (error) {
      console.error('Erreur lors de la création:', error);
      alert('Erreur lors de la création du sondage');
    }
  };

  // Supprimer un sondage
  const handleDeleteSurvey = async (surveyId: string) => {
    if (!surveyId || surveyId.trim() === '') {
      console.error('❌ ID de sondage invalide:', surveyId);
      alert('Erreur: ID de sondage invalide');
      return;
    }

    if (!confirm('Êtes-vous sûr de vouloir supprimer ce sondage ? Cette action supprimera également toutes les questions associées.')) {
      return;
    }

    try {
      console.log('🗑️ Début de la suppression du sondage:', surveyId);
      
      // Vérifier que le sondage existe d'abord
      const surveyRef = doc(db, 'surveys', surveyId);
      const surveyDoc = await getDoc(surveyRef);
      
      if (!surveyDoc.exists()) {
        alert('Ce sondage n\'existe pas ou a déjà été supprimé.');
        await loadSurveys();
        return;
      }
      
      console.log('✅ Sondage trouvé:', surveyDoc.data());
      
      // D'abord, supprimer toutes les questions du sondage
      const questionsRef = collection(db, 'surveys', surveyId, 'questions');
      const questionsSnapshot = await getDocs(questionsRef);
      
      console.log(`📋 Trouvé ${questionsSnapshot.size} question(s) à supprimer`);
      
      if (questionsSnapshot.size > 0) {
        const deletePromises = questionsSnapshot.docs.map(async (questionDoc) => {
          try {
            const questionRef = doc(db, 'surveys', surveyId, 'questions', questionDoc.id);
            console.log(`🗑️ Tentative de suppression de la question: ${questionDoc.id}`);
            await deleteDoc(questionRef);
            console.log(`✅ Question supprimée: ${questionDoc.id}`);
          } catch (questionError: any) {
            console.error(`❌ Erreur lors de la suppression de la question ${questionDoc.id}:`, questionError);
            throw new Error(`Erreur lors de la suppression de la question ${questionDoc.id}: ${questionError?.message || questionError?.code || 'Erreur inconnue'}`);
          }
        });
        
        await Promise.all(deletePromises);
        console.log('✅ Toutes les questions ont été supprimées');
      } else {
        console.log('ℹ️ Aucune question à supprimer');
      }
      
      // Ensuite, supprimer le sondage lui-même
      console.log('🗑️ Tentative de suppression du sondage:', surveyId);
      await deleteDoc(surveyRef);
      console.log('✅ Sondage supprimé avec succès');
      
      // Recharger la liste
      await loadSurveys();
      alert('Sondage supprimé avec succès');
    } catch (error: any) {
      console.error('❌ Erreur complète lors de la suppression:', error);
      console.error('❌ Code d\'erreur:', error?.code);
      console.error('❌ Message d\'erreur:', error?.message);
      console.error('❌ Stack:', error?.stack);
      
      if (error?.code === 'permission-denied') {
        alert('❌ Erreur de permissions Firebase.\n\nVérifiez que les règles Firestore sont bien déployées:\n\nmatch /surveys/{surveyId} {\n  allow read, write: if true;\n  match /questions/{questionId} {\n    allow read, write: if true;\n  }\n}\n\nOuvrez la console (F12) pour plus de détails.');
      } else if (error?.code === 'not-found') {
        alert('Le sondage n\'existe pas ou a déjà été supprimé.');
        await loadSurveys();
      } else {
        alert('Erreur lors de la suppression:\n\n' + (error?.message || error?.code || 'Erreur inconnue') + '\n\nOuvrez la console (F12) pour plus de détails.');
      }
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        background: 'white',
        borderRadius: '20px',
        padding: '40px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '30px'
        }}>
          <h1 style={{ color: '#333', margin: 0 }}>📊 Gestion des Sondages</h1>
          <button
            onClick={() => router.push('/admin')}
            style={{
              padding: '10px 20px',
              background: '#f5f5f5',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            ← Retour au panneau admin
          </button>
        </div>

        {/* Créer un nouveau sondage */}
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '25px',
          borderRadius: '15px',
          marginBottom: '40px'
        }}>
          <h2 style={{ color: 'white', margin: '0 0 20px 0', fontSize: '24px' }}>
            ➕ Créer un nouveau sondage
          </h2>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Nom du sondage (ex: Sondage satisfaction 2024)"
              value={newSurveyName}
              onChange={(e) => setNewSurveyName(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleCreateSurvey();
                }
              }}
              style={{
                flex: 1,
                padding: '15px',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '10px',
                fontSize: '16px',
                background: 'rgba(255, 255, 255, 0.95)'
              }}
            />
            <button
              onClick={handleCreateSurvey}
              style={{
                padding: '15px 30px',
                background: 'white',
                color: '#667eea',
                border: 'none',
                borderRadius: '10px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              ➕ Créer
            </button>
          </div>
        </div>

        {/* Liste des sondages */}
        <div>
          <h2 style={{ color: '#555', marginBottom: '20px' }}>Sondages existants ({surveys.length})</h2>
          {surveys.length === 0 ? (
            <p style={{ color: '#999', fontStyle: 'italic' }}>
              Aucun sondage pour le moment. Créez-en un pour commencer.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {surveys.map((survey) => (
                <div
                  key={survey.id}
                  style={{
                    background: '#f9f9f9',
                    padding: '20px',
                    borderRadius: '10px',
                    border: '1px solid #e0e0e0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', fontSize: '18px', marginBottom: '5px' }}>
                      {survey.name || survey.id}
                    </div>
                    <div style={{ fontSize: '14px', color: '#666' }}>
                      ID: <code style={{ background: '#f0f0f0', padding: '2px 6px', borderRadius: '4px' }}>{survey.id}</code>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={() => router.push(`/admin/surveys/${survey.id}`)}
                      style={{
                        padding: '10px 20px',
                        background: '#2196f3',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '600'
                      }}
                    >
                      ✏️ Éditer
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('🔘 Clic sur le bouton supprimer pour:', survey.id);
                        handleDeleteSurvey(survey.id);
                      }}
                      style={{
                        padding: '10px 20px',
                        background: '#f44336',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '600'
                      }}
                    >
                      🗑️ Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
