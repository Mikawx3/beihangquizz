'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  deleteDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import Modal from '@/app/components/Modal';

interface Question {
  id: string;
  question: string;
  options: string[];
  type?: 'multiple-choice' | 'ranking'; // multiple-choice pour choix simple, ranking pour classement
}

// Fonction utilitaire pour nettoyer complètement une session (toutes les sous-collections)
const cleanupSession = async (sessionId: string) => {
  try {
    console.log('🧹 Nettoyage de la session:', sessionId);
    const sessionRef = doc(db, 'sessions', sessionId);
    
    // Supprimer tous les participants (même si le document de session n'existe pas)
    try {
      const participantsRef = collection(db, 'sessions', sessionId, 'participants');
      const participantsSnapshot = await getDocs(participantsRef);
      if (participantsSnapshot.size > 0) {
        const batch1 = writeBatch(db);
        participantsSnapshot.forEach((doc) => {
          batch1.delete(doc.ref);
        });
        await batch1.commit();
        console.log(`✅ ${participantsSnapshot.size} participant(s) supprimé(s)`);
      }
    } catch (error: any) {
      // Si la collection n'existe pas, ce n'est pas grave
      if (error?.code !== 'not-found') {
        console.warn('⚠️ Erreur lors de la suppression des participants:', error);
      }
    }
    
    // Supprimer toutes les questions de session (même si le document de session n'existe pas)
    try {
      const questionsRef = collection(db, 'sessions', sessionId, 'questions');
      const questionsSnapshot = await getDocs(questionsRef);
      if (questionsSnapshot.size > 0) {
        const batch2 = writeBatch(db);
        questionsSnapshot.forEach((doc) => {
          batch2.delete(doc.ref);
        });
        await batch2.commit();
        console.log(`✅ ${questionsSnapshot.size} question(s) de session supprimée(s)`);
      }
    } catch (error: any) {
      // Si la collection n'existe pas, ce n'est pas grave
      if (error?.code !== 'not-found') {
        console.warn('⚠️ Erreur lors de la suppression des questions:', error);
      }
    }
    
    // Supprimer le document de session principal (seulement s'il existe)
    try {
      const sessionDoc = await getDoc(sessionRef);
      if (sessionDoc.exists()) {
        await deleteDoc(sessionRef);
        console.log('✅ Document de session supprimé');
      }
    } catch (error: any) {
      // Si le document n'existe pas, ce n'est pas grave
      if (error?.code !== 'not-found') {
        console.warn('⚠️ Erreur lors de la suppression du document de session:', error);
      }
    }
    
    console.log('✅ Session complètement nettoyée');
  } catch (error) {
    console.error('❌ Erreur lors du nettoyage de la session:', error);
    throw error;
  }
};

export default function EditQCM() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;
  
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [showJsonImport, setShowJsonImport] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [newQuestion, setNewQuestion] = useState<Omit<Question, 'id'>>({
    question: '',
    options: ['', '', '', ''],
    type: 'multiple-choice',
  });
  const [rankingOrder, setRankingOrder] = useState<number[]>([]); // Ordre pour les questions de type ranking
  const [sessionExists, setSessionExists] = useState(false);
  const [importedQuestions, setImportedQuestions] = useState<Omit<Question, 'id'>[]>([]); // Questions importées en attente de sauvegarde
  
  // États pour les modals
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    type: 'alert' | 'confirm';
    title: string;
    message: string;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    type: 'alert',
    title: '',
    message: '',
  });

  // Fonction helper pour afficher une alerte
  const showAlert = (title: string, message: string) => {
    setModalState({
      isOpen: true,
      type: 'alert',
      title,
      message,
    });
  };

  // Fonction helper pour afficher une confirmation
  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setModalState({
      isOpen: true,
      type: 'confirm',
      title,
      message,
      onConfirm,
    });
  };

  // Charger les questions de la session
  const loadQuestions = useCallback(async () => {
    try {
      // Vérifier si la session existe
      const sessionRef = doc(db, 'sessions', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      setSessionExists(sessionDoc.exists());

      // Charger les questions de la session
      const questionsRef = collection(db, 'sessions', sessionId, 'questions');
      const snapshot = await getDocs(questionsRef);
      const loadedQuestions: Question[] = [];
      snapshot.forEach((doc) => {
        loadedQuestions.push({ id: doc.id, ...doc.data() } as Question);
      });
      // Trier par ID
      loadedQuestions.sort((a, b) => a.id.localeCompare(b.id));
      setQuestions(loadedQuestions);
    } catch (error: any) {
      console.error('Erreur lors du chargement des questions:', error);
      if (error?.code === 'permission-denied' || error?.message?.includes('permission')) {
        console.error('⚠️ Erreur de permissions Firebase. Vérifiez les règles Firestore.');
      }
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) {
      loadQuestions();
    }
  }, [sessionId, loadQuestions]);

  // Créer la session si elle n'existe pas
  const createSession = async () => {
    try {
      // TOUJOURS nettoyer la session avant de créer/réutiliser (même si elle n'existe pas encore)
      // Cela garantit qu'il n'y a pas de données résiduelles
      console.log('🧹 Nettoyage préventif de la session:', sessionId);
      await cleanupSession(sessionId);
      
      // Créer une nouvelle session propre
      const sessionRef = doc(db, 'sessions', sessionId);
      await setDoc(sessionRef, {
        currentQuestionIndex: -1,
        isActive: false,
        createdAt: new Date(),
        hasQCM: true,
      });
      setSessionExists(true);
      showAlert('Succès', 'Session créée avec succès !');
    } catch (error) {
      console.error('Erreur lors de la création de la session:', error);
      showAlert('Erreur', 'Erreur lors de la création de la session');
    }
  };

  // Parser le JSON et créer les questions
  const handleJsonImport = async () => {
    try {
      if (!jsonInput.trim()) {
        showAlert('Erreur', 'Veuillez entrer du contenu JSON');
        return;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(jsonInput);
      } catch (parseError) {
        // Essayer de parser comme texte simple (format ligne par ligne)
        const lines = jsonInput.split('\n').filter((l: string) => l.trim());
        if (lines.length >= 5) {
          // Format simple: Question\nOption1\nOption2\nOption3\nOption4\nCorrectIndex
          parsed = [];
          for (let i = 0; i < lines.length; i += 6) {
            if (i + 5 < lines.length) {
              parsed.push({
                question: lines[i].trim(),
                options: [
                  lines[i + 1].trim(),
                  lines[i + 2].trim(),
                  lines[i + 3].trim(),
                  lines[i + 4].trim(),
                ],
              });
            }
          }
        } else {
          showAlert('Erreur', 'Format JSON invalide. Utilisez un tableau de questions ou le format ligne par ligne.');
          return;
        }
      }

      let questionsToAdd: Omit<Question, 'id'>[] = [];

      // Format 1: Array de questions
      if (Array.isArray(parsed)) {
        questionsToAdd = parsed
          .filter((q: any) => q && (q.question || q.text))
          .map((q: any) => {
            const questionType = q.type || 'multiple-choice';
            const options = q.options || q.choices || (Array.isArray(q.options) ? q.options : ['', '', '', '']);
            
            return {
              question: q.question || q.text || '',
              options: options,
              type: questionType as 'multiple-choice' | 'ranking',
            };
          });
      }
      // Format 2: Objet avec propriété questions
      else if (parsed && parsed.questions && Array.isArray(parsed.questions)) {
        questionsToAdd = parsed.questions
          .filter((q: any) => q && (q.question || q.text))
          .map((q: any) => {
            const questionType = q.type || 'multiple-choice';
            const options = q.options || q.choices || (Array.isArray(q.options) ? q.options : ['', '', '', '']);
            
            return {
              question: q.question || q.text || '',
              options: options,
              type: questionType as 'multiple-choice' | 'ranking',
            };
          });
      }
      // Format 3: Objet unique avec une question
      else if (parsed && (parsed.question || parsed.text)) {
        const questionType = parsed.type || 'multiple-choice';
        const options = parsed.options || parsed.choices || ['', '', '', ''];
        
        questionsToAdd = [{
          question: parsed.question || parsed.text || '',
          options: options,
          type: (questionType === 'ranking' ? 'ranking' : 'multiple-choice') as 'multiple-choice' | 'ranking',
        }];
      }

      // Valider les questions
      questionsToAdd = questionsToAdd.filter((q) => {
        if (!q.question.trim()) return false;
        if (!Array.isArray(q.options) || q.options.length < 2) return false;
        return true;
      });

      if (questionsToAdd.length === 0) {
        showAlert('Erreur', 'Aucune question valide trouvée dans le JSON. Vérifiez le format.');
        return;
      }

      // Afficher l'aperçu des questions importées
      setImportedQuestions(questionsToAdd);
      showAlert('Succès', `${questionsToAdd.length} question(s) importée(s) avec succès ! Utilisez le bouton "Sauvegarder" pour les enregistrer dans le sondage.`);
    } catch (error) {
      console.error('Erreur lors de l\'import JSON:', error);
      showAlert('Erreur', 'Erreur lors de l\'import JSON. Vérifiez le format.');
      setImportedQuestions([]);
    }
  };

  // Sauvegarder les questions importées
  const handleSaveImportedQuestions = async () => {
    if (importedQuestions.length === 0) {
      showAlert('Erreur', 'Aucune question à sauvegarder');
      return;
    }

    try {
      const baseTime = Date.now();
      await Promise.all(
        importedQuestions.map(async (q, index) => {
          const questionId = `q${baseTime}-${index}`;
          const questionRef = doc(db, 'sessions', sessionId, 'questions', questionId);
          await setDoc(questionRef, q);
        })
      );

      showAlert('Succès', `${importedQuestions.length} question(s) sauvegardée(s) avec succès !`);
      setImportedQuestions([]);
      setJsonInput('');
      setShowJsonImport(false);
      await loadQuestions();
    } catch (saveError: any) {
      console.error('Erreur lors de la sauvegarde:', saveError);
      if (saveError?.code === 'permission-denied' || saveError?.message?.includes('permission')) {
        showAlert('Erreur', 'Erreur de permissions Firebase. Vérifiez que les règles Firestore permettent l\'écriture dans sessions/{sessionId}/questions');
      } else {
        showAlert('Erreur', 'Erreur lors de la sauvegarde des questions: ' + (saveError?.message || 'Erreur inconnue'));
      }
    }
  };

  // Ajouter ou modifier une question
  const handleSaveQuestion = async () => {
    if (!newQuestion.question.trim()) {
      showAlert('Erreur', 'Veuillez entrer une question');
      return;
    }
    if (newQuestion.options.some(opt => !opt.trim())) {
      showAlert('Erreur', 'Veuillez remplir toutes les options');
      return;
    }

    try {
      const questionId = editingQuestion 
        ? editingQuestion.id 
        : `q${Date.now()}`;

      const questionRef = doc(db, 'sessions', sessionId, 'questions', questionId);
      await setDoc(questionRef, {
        question: newQuestion.question,
        options: newQuestion.options,
        type: newQuestion.type || 'multiple-choice',
      });

      await loadQuestions();
      setShowQuestionForm(false);
      setEditingQuestion(null);
      setNewQuestion({
        question: '',
        options: ['', '', '', ''],
        type: 'multiple-choice',
      });
      setRankingOrder([]);
      showAlert('Succès', editingQuestion ? 'Question modifiée avec succès' : 'Question ajoutée avec succès');
    } catch (error: any) {
      console.error('Erreur lors de la sauvegarde:', error);
      if (error?.code === 'permission-denied' || error?.message?.includes('permission')) {
        showAlert('Erreur', 'Erreur de permissions Firebase. Vérifiez que les règles Firestore permettent l\'écriture dans sessions/{sessionId}/questions');
      } else {
        showAlert('Erreur', 'Erreur lors de la sauvegarde: ' + (error?.message || 'Erreur inconnue'));
      }
    }
  };

  // Supprimer une question
  const handleDeleteQuestion = async (id: string) => {
    if (!sessionId || !id) {
      showAlert('Erreur', 'Erreur: Session ID ou Question ID manquant');
      return;
    }

    showConfirm(
      'Confirmer la suppression',
      'Êtes-vous sûr de vouloir supprimer cette question ?',
      async () => {
        try {
          console.log('🗑️ Suppression de la question:', id, 'dans la session:', sessionId);
          const questionRef = doc(db, 'sessions', sessionId, 'questions', id);
          await deleteDoc(questionRef);
          console.log('✅ Question supprimée avec succès');
          await loadQuestions();
          showAlert('Succès', 'Question supprimée avec succès');
        } catch (error: any) {
          console.error('❌ Erreur lors de la suppression:', error);
          if (error?.code === 'permission-denied' || error?.message?.includes('permission')) {
            showAlert('Erreur', 'Erreur de permissions Firebase. Vérifiez que les règles Firestore permettent la suppression dans sessions/{sessionId}/questions');
          } else {
            showAlert('Erreur', 'Erreur lors de la suppression: ' + (error?.message || 'Erreur inconnue'));
          }
        }
      }
    );
  };

  // Éditer une question
  const handleEditQuestion = (question: Question) => {
    setEditingQuestion(question);
    setNewQuestion({
      question: question.question,
      options: [...question.options],
      type: question.type || 'multiple-choice',
    });
    if (question.type === 'ranking') {
      const initialOrder = question.options.map((_, i) => i);
      setRankingOrder(initialOrder);
    } else {
      setRankingOrder([]);
    }
    setShowQuestionForm(true);
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
          <div>
            <h1 style={{ color: '#333', margin: 0 }}>📝 Édition Sondage - Session {sessionId}</h1>
            {!sessionExists && (
              <p style={{ color: '#f44336', marginTop: '10px' }}>
                ⚠️ Cette session n&apos;existe pas encore. Créez-la pour commencer.
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {!sessionExists && (
              <button
                onClick={createSession}
                style={{
                  padding: '10px 20px',
                  background: '#4caf50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                ✅ Créer la session
              </button>
            )}
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
        </div>

        {sessionExists && (
          <>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '30px',
              gap: '10px'
            }}>
              <h2 style={{ color: '#555', margin: 0 }}>Questions ({questions.length})</h2>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => {
                    setShowJsonImport(true);
                    setJsonInput('');
                  }}
                  style={{
                    padding: '12px 24px',
                    background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  📥 Importer JSON
                </button>
                <button
                  onClick={() => {
                    setShowQuestionForm(true);
                    setEditingQuestion(null);
                    setNewQuestion({
                      question: '',
                      options: ['', '', '', ''],
                      type: 'multiple-choice',
                    });
                  }}
                  style={{
                    padding: '12px 24px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  + Ajouter une question
                </button>
              </div>
            </div>

            {showJsonImport && (
              <div style={{
                background: '#f5f5f5',
                padding: '20px',
                borderRadius: '10px',
                marginBottom: '30px'
              }}>
                <h3 style={{ marginBottom: '15px' }}>Import JSON</h3>
                <p style={{ marginBottom: '15px', color: '#666', fontSize: '14px' }}>
                  Formats acceptés :
                  <br />• Array de questions : <code>[{`{question: "...", options: [...], type: "multiple-choice"}`}]</code>
                  <br />• Objet avec propriété questions : <code>{`{questions: [...]}`}</code>
                  <br />
                  <br /><strong>Types de questions disponibles :</strong>
                  <br />• <code>&quot;multiple-choice&quot;</code> : Choix multiple
                  <br />• <code>&quot;ranking&quot;</code> : Classement/Tri
                </p>
                <textarea
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  placeholder={`Exemple JSON:\n[\n  {\n    "question": "Quelle est votre couleur préférée ?",\n    "options": ["Rouge", "Bleu", "Vert", "Jaune"],\n    "type": "multiple-choice"\n  },\n  {\n    "question": "Classer ces villes du nord au sud",\n    "options": ["Paris", "Lyon", "Marseille", "Nice"],\n    "type": "ranking"\n  }\n]\n\nExemple avec 2 questions:\n[\n  {\n    "question": "Classer ces activités par ordre de préférence",\n    "options": ["Lecture", "Sport", "Cinéma", "Musique"],\n    "type": "ranking"\n  },\n  {\n    "question": "Quel est votre moyen de transport préféré ?",\n    "options": ["Voiture", "Vélo", "Transport en commun", "À pied"],\n    "type": "multiple-choice"\n  }\n]`}
                  style={{
                    width: '100%',
                    minHeight: '200px',
                    padding: '12px',
                    border: '2px solid #e0e0e0',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                    marginBottom: '15px'
                  }}
                />
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={handleJsonImport}
                    style={{
                      padding: '12px 24px',
                      background: '#2196f3',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      fontSize: '16px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    📋 Importer (Aperçu)
                  </button>
                  <button
                    onClick={() => {
                      setShowJsonImport(false);
                      setJsonInput('');
                      setImportedQuestions([]);
                    }}
                    style={{
                      padding: '12px 24px',
                      background: '#f5f5f5',
                      border: 'none',
                      borderRadius: '10px',
                      fontSize: '16px',
                      cursor: 'pointer'
                    }}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}

            {/* Aperçu des questions importées */}
            {importedQuestions.length > 0 && (
              <div style={{
                background: '#e8f5e9',
                padding: '25px',
                borderRadius: '15px',
                marginBottom: '30px',
                border: '2px solid #4caf50'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ margin: 0, color: '#2e7d32' }}>
                    📋 Aperçu des questions importées ({importedQuestions.length})
                  </h3>
                  <button
                    onClick={handleSaveImportedQuestions}
                    style={{
                      padding: '12px 24px',
                      background: '#4caf50',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      fontSize: '16px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    💾 Sauvegarder dans le sondage
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  {importedQuestions.map((question, index) => (
                    <div
                      key={index}
                      style={{
                        background: 'white',
                        padding: '15px',
                        borderRadius: '10px',
                        border: '1px solid #c8e6c9'
                      }}
                    >
                      <div style={{ fontWeight: '600', marginBottom: '10px', fontSize: '16px', color: '#333' }}>
                        Question {index + 1}: {question.question}
                      </div>
                      <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                        Type: {question.type === 'ranking' ? 'Classement / Tri' : 'Choix multiple'}
                      </div>
                      <div style={{ marginLeft: '15px' }}>
                        {question.options.map((option, optIndex) => (
                          <div
                            key={optIndex}
                            style={{
                              padding: '6px',
                              margin: '4px 0',
                              background: '#f5f5f5',
                              borderRadius: '5px',
                              fontSize: '14px'
                            }}
                          >
                            {optIndex + 1}. {option}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
                  <button
                    onClick={handleSaveImportedQuestions}
                    style={{
                      padding: '12px 24px',
                      background: '#4caf50',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      fontSize: '16px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      flex: 1
                    }}
                  >
                    💾 Sauvegarder toutes les questions
                  </button>
                  <button
                    onClick={() => {
                      setImportedQuestions([]);
                      setJsonInput('');
                    }}
                    style={{
                      padding: '12px 24px',
                      background: '#ffebee',
                      color: '#c62828',
                      border: 'none',
                      borderRadius: '10px',
                      fontSize: '16px',
                      cursor: 'pointer'
                    }}
                  >
                    ✖️ Annuler l&apos;import
                  </button>
                </div>
              </div>
            )}

            {showQuestionForm && (
              <div style={{
                background: '#f5f5f5',
                padding: '20px',
                borderRadius: '10px',
                marginBottom: '30px'
              }}>
                <h3 style={{ marginBottom: '20px' }}>
                  {editingQuestion ? 'Modifier la question' : 'Nouvelle question'}
                </h3>
                <select
                  value={newQuestion.type}
                  onChange={(e) => {
                    const newType = e.target.value as 'multiple-choice' | 'ranking';
                    setNewQuestion({ ...newQuestion, type: newType });
                    if (newType === 'ranking') {
                      const initialOrder = newQuestion.options.map((_, index) => index);
                      setRankingOrder(initialOrder);
                    } else {
                      setRankingOrder([]);
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #e0e0e0',
                    borderRadius: '8px',
                    fontSize: '16px',
                    marginBottom: '15px'
                  }}
                >
                  <option value="multiple-choice">Choix multiple</option>
                  <option value="ranking">Classement / Tri</option>
                </select>
                <input
                  type="text"
                  placeholder="Question"
                  value={newQuestion.question}
                  onChange={(e) => setNewQuestion({ ...newQuestion, question: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #e0e0e0',
                    borderRadius: '8px',
                    fontSize: '16px',
                    marginBottom: '15px'
                  }}
                />
                {newQuestion.type === 'multiple-choice' && (
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '10px', fontWeight: '600' }}>
                      Options de réponse :
                    </label>
                    {newQuestion.options.map((option, index) => (
                      <div key={index} style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ width: '20px', textAlign: 'center', color: '#999' }}>{index + 1}.</span>
                        <input
                          type="text"
                          placeholder={`Option ${index + 1}`}
                          value={option}
                          onChange={(e) => {
                            const newOptions = [...newQuestion.options];
                            newOptions[index] = e.target.value;
                            setNewQuestion({ ...newQuestion, options: newOptions });
                          }}
                          style={{
                            flex: 1,
                            padding: '10px',
                            border: '2px solid #e0e0e0',
                            borderRadius: '8px',
                            fontSize: '14px'
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
                {newQuestion.type === 'ranking' && (
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '10px', fontWeight: '600' }}>
                      Options à classer (réorganisez-les dans l&apos;ordre souhaité) :
                    </label>
                    <div style={{ 
                      background: '#fff', 
                      padding: '15px', 
                      borderRadius: '8px', 
                      border: '2px solid #e0e0e0',
                      marginBottom: '15px'
                    }}>
                      <p style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>
                        Cliquez et glissez pour réorganiser les options :
                      </p>
                      {(() => {
                        const currentOrder = rankingOrder.length > 0 
                          ? rankingOrder 
                          : newQuestion.options.map((_, i) => i);
                        return currentOrder.map((optionIndex, displayIndex) => (
                          <div
                            key={optionIndex}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', String(displayIndex));
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'));
                              const newOrder = [...currentOrder];
                              const [removed] = newOrder.splice(draggedIndex, 1);
                              newOrder.splice(displayIndex, 0, removed);
                              setRankingOrder(newOrder);
                            }}
                            style={{
                              padding: '12px',
                              margin: '8px 0',
                              background: '#f9f9f9',
                              border: '2px solid #ddd',
                              borderRadius: '8px',
                              cursor: 'move',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px'
                            }}
                          >
                            <span style={{ 
                              background: '#667eea', 
                              color: 'white', 
                              borderRadius: '50%', 
                              width: '24px', 
                              height: '24px', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}>
                              {displayIndex + 1}
                            </span>
                            <input
                              type="text"
                              placeholder={`Option ${optionIndex + 1}`}
                              value={newQuestion.options[optionIndex]}
                              onChange={(e) => {
                                const newOptions = [...newQuestion.options];
                                newOptions[optionIndex] = e.target.value;
                                setNewQuestion({ ...newQuestion, options: newOptions });
                              }}
                              style={{
                                flex: 1,
                                padding: '8px',
                                border: '1px solid #e0e0e0',
                                borderRadius: '6px',
                                fontSize: '14px'
                              }}
                            />
                            <span style={{ color: '#999', fontSize: '12px' }}>⋮⋮</span>
                          </div>
                        ));
                      })()}
                    </div>
                      <button
                        type="button"
                        onClick={() => {
                          // Ajouter une nouvelle option
                          const newOptions = [...newQuestion.options, ''];
                          const newOrder = [...rankingOrder, newQuestion.options.length];
                          setNewQuestion({ ...newQuestion, options: newOptions });
                          setRankingOrder(newOrder);
                        }}
                      style={{
                        padding: '8px 16px',
                        background: '#e3f2fd',
                        color: '#1976d2',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        cursor: 'pointer',
                        marginRight: '10px'
                      }}
                    >
                      + Ajouter une option
                    </button>
                    {newQuestion.options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => {
                          // Supprimer la dernière option
                          const newOptions = newQuestion.options.slice(0, -1);
                          const newOrder = rankingOrder.filter(idx => idx < newOptions.length);
                          setNewQuestion({ ...newQuestion, options: newOptions });
                          setRankingOrder(newOrder);
                        }}
                        style={{
                          padding: '8px 16px',
                          background: '#ffebee',
                          color: '#c62828',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '14px',
                          cursor: 'pointer'
                        }}
                      >
                        - Supprimer la dernière option
                      </button>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={handleSaveQuestion}
                    style={{
                      padding: '12px 24px',
                      background: '#4caf50',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      fontSize: '16px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    💾 Enregistrer
                  </button>
                  <button
                    onClick={() => {
                      setShowQuestionForm(false);
                      setEditingQuestion(null);
                      setNewQuestion({
                        question: '',
                        options: ['', '', '', ''],
                        type: 'multiple-choice',
                      });
                      setRankingOrder([]);
                    }}
                    style={{
                      padding: '12px 24px',
                      background: '#f5f5f5',
                      border: 'none',
                      borderRadius: '10px',
                      fontSize: '16px',
                      cursor: 'pointer'
                    }}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}

            <div>
              {questions.length === 0 ? (
                <p style={{ color: '#999', fontStyle: 'italic' }}>
                  Aucune question pour le moment. Ajoutez-en une pour commencer.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  {questions.map((question) => (
                    <div
                      key={question.id}
                      style={{
                        background: '#f9f9f9',
                        padding: '20px',
                        borderRadius: '10px',
                        border: '1px solid #e0e0e0'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '600', marginBottom: '10px', fontSize: '16px' }}>
                            {question.question}
                          </div>
                          {question.type === 'multiple-choice' && (
                            <div style={{ marginLeft: '20px' }}>
                              {question.options.map((option, index) => (
                                <div
                                  key={index}
                                  style={{
                                    padding: '8px',
                                    margin: '5px 0',
                                    background: 'white',
                                    borderRadius: '5px',
                                    border: '1px solid #e0e0e0'
                                  }}
                                >
                                  {index + 1}. {option}
                                </div>
                              ))}
                            </div>
                          )}
                          {question.type === 'ranking' && (
                            <div style={{ marginLeft: '20px' }}>
                              <p style={{ fontSize: '14px', color: '#666', marginBottom: '10px', fontStyle: 'italic' }}>
                                Type: Classement / Tri
                              </p>
                              <div>
                                {question.options.map((option, index) => (
                                  <div
                                    key={index}
                                    style={{
                                      padding: '8px',
                                      margin: '5px 0',
                                      background: 'white',
                                      borderRadius: '5px',
                                      border: '1px solid #e0e0e0'
                                    }}
                                  >
                                    {index + 1}. {option}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '10px', marginLeft: '20px' }}>
                          <button
                            onClick={() => handleEditQuestion(question)}
                            style={{
                              padding: '8px 16px',
                              background: '#2196f3',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              fontSize: '14px'
                            }}
                          >
                            ✏️ Modifier
                          </button>
                          <button
                            onClick={() => handleDeleteQuestion(question.id)}
                            style={{
                              padding: '8px 16px',
                              background: '#f44336',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              fontSize: '14px'
                            }}
                          >
                            🗑️ Supprimer
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      
      <Modal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ ...modalState, isOpen: false })}
        title={modalState.title}
        message={modalState.message}
        type={modalState.type}
        onConfirm={modalState.onConfirm}
        confirmText="Supprimer"
      />
    </div>
  );
}
