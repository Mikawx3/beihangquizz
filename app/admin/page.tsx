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
import Modal from '@/app/components/Modal';

interface Question {
  id: number;
  question: string;
  options: string[];
  correct: number;
}

export default function AdminPanel() {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    // Vérifier si l'utilisateur est déjà authentifié dans localStorage
    if (typeof window !== 'undefined') {
      return localStorage.getItem('adminAuthenticated') === 'true';
    }
    return false;
  });
  const [adminPassword, setAdminPassword] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [newQuestion, setNewQuestion] = useState<Omit<Question, 'id'>>({
    question: '',
    options: ['', '', '', ''],
    correct: 0,
  });
  const [sessionIdInput, setSessionIdInput] = useState('');
  const [surveys, setSurveys] = useState<any[]>([]);
  const [selectedSurveyId, setSelectedSurveyId] = useState('');
  const [sessions, setSessions] = useState<any[]>([]);
  const router = useRouter();
  
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

  // Charger le mot de passe admin depuis Firestore
  useEffect(() => {
    const loadAdminPassword = async () => {
      try {
        const adminRef = doc(db, 'admin', 'config');
        const adminDoc = await getDoc(adminRef);
        if (adminDoc.exists()) {
          setAdminPassword(adminDoc.data().password || 'admin123');
        } else {
          // Créer le mot de passe par défaut
          await setDoc(adminRef, { password: 'admin123' });
          setAdminPassword('admin123');
        }
      } catch (error) {
        console.error('Erreur lors du chargement du mot de passe:', error);
      }
    };
    loadAdminPassword();
  }, []);

  // Charger les questions depuis Firestore
  const loadQuestions = async () => {
    try {
      const questionsRef = collection(db, 'questions');
      const snapshot = await getDocs(questionsRef);
      const loadedQuestions: Question[] = [];
      snapshot.forEach((doc) => {
        loadedQuestions.push({ id: parseInt(doc.id), ...doc.data() } as Question);
      });
      // Trier par ID
      loadedQuestions.sort((a, b) => a.id - b.id);
      setQuestions(loadedQuestions);
    } catch (error) {
      console.error('Erreur lors du chargement des questions:', error);
    }
  };

  // Charger les sondages disponibles
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

  // Charger les sessions disponibles
  const loadSessions = useCallback(async () => {
    try {
      const sessionsRef = collection(db, 'sessions');
      const snapshot = await getDocs(sessionsRef);
      const loadedSessions: any[] = [];
      snapshot.forEach((doc) => {
        loadedSessions.push({ id: doc.id, ...doc.data() });
      });
      // Trier par date de création (plus récent en premier)
      loadedSessions.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.createdAt?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
      setSessions(loadedSessions);
    } catch (error) {
      console.error('Erreur lors du chargement des sessions:', error);
    }
  }, []);

  // Charger les questions, sondages et sessions une fois authentifié
  useEffect(() => {
    if (isAuthenticated) {
      loadQuestions();
      loadSurveys();
      loadSessions();
    }
  }, [isAuthenticated, loadSurveys, loadSessions]);

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

  // Vérifier le mot de passe
  const handleLogin = async () => {
    if (!password.trim()) {
      showAlert('Erreur', 'Veuillez entrer le mot de passe');
      return;
    }

    try {
      const adminRef = doc(db, 'admin', 'config');
      const adminDoc = await getDoc(adminRef);
      const storedPassword = adminDoc.exists() 
        ? adminDoc.data().password 
        : 'admin123';

      if (password === storedPassword) {
        setIsAuthenticated(true);
        // Persister l'authentification dans localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem('adminAuthenticated', 'true');
        }
        setPassword('');
      } else {
        showAlert('Erreur', 'Mot de passe incorrect');
        setPassword('');
      }
    } catch (error) {
      console.error('Erreur lors de la vérification:', error);
      showAlert('Erreur', 'Erreur lors de la connexion');
    }
  };

  // Modifier le mot de passe admin
  const handleChangePassword = async () => {
    const newPassword = prompt('Nouveau mot de passe:');
    if (!newPassword || newPassword.length < 4) {
      showAlert('Erreur', 'Le mot de passe doit contenir au moins 4 caractères');
      return;
    }

    try {
      const adminRef = doc(db, 'admin', 'config');
      await updateDoc(adminRef, { password: newPassword });
      setAdminPassword(newPassword);
      showAlert('Succès', 'Mot de passe modifié avec succès');
    } catch (error) {
      console.error('Erreur lors de la modification:', error);
      showAlert('Erreur', 'Erreur lors de la modification du mot de passe');
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
    if (newQuestion.correct < 0 || newQuestion.correct >= newQuestion.options.length) {
      showAlert('Erreur', 'Veuillez sélectionner une réponse correcte valide');
      return;
    }

    try {
      const questionId = editingQuestion 
        ? editingQuestion.id 
        : questions.length > 0 
          ? Math.max(...questions.map(q => q.id)) + 1 
          : 1;

      const questionRef = doc(db, 'questions', String(questionId));
      await setDoc(questionRef, {
        question: newQuestion.question,
        options: newQuestion.options,
        correct: newQuestion.correct,
      });

      await loadQuestions();
      setShowQuestionForm(false);
      setEditingQuestion(null);
      setNewQuestion({
        question: '',
        options: ['', '', '', ''],
        correct: 0,
      });
      showAlert('Succès', editingQuestion ? 'Question modifiée avec succès' : 'Question ajoutée avec succès');
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      showAlert('Erreur', 'Erreur lors de la sauvegarde');
    }
  };

  // Supprimer une question
  const handleDeleteQuestion = async (id: number) => {
    showConfirm(
      'Confirmer la suppression',
      'Êtes-vous sûr de vouloir supprimer cette question ?',
      async () => {
        try {
          const questionRef = doc(db, 'questions', String(id));
          await deleteDoc(questionRef);
          await loadQuestions();
          showAlert('Succès', 'Question supprimée avec succès');
        } catch (error) {
          console.error('Erreur lors de la suppression:', error);
          showAlert('Erreur', 'Erreur lors de la suppression');
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
      correct: question.correct,
    });
    setShowQuestionForm(true);
  };

  // Écran de connexion
  if (!isAuthenticated) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}>
        <div style={{
          background: 'white',
          borderRadius: '20px',
          padding: '40px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          maxWidth: '400px',
          width: '100%'
        }}>
          <h1 style={{ textAlign: 'center', marginBottom: '30px', color: '#333' }}>
            🔐 Panneau Admin
          </h1>
          <input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
            style={{
              width: '100%',
              padding: '15px',
              border: '2px solid #e0e0e0',
              borderRadius: '10px',
              fontSize: '16px',
              marginBottom: '20px'
            }}
          />
          <button
            onClick={handleLogin}
            style={{
              width: '100%',
              padding: '15px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Se connecter
          </button>
          <button
            onClick={() => router.push('/')}
            style={{
              width: '100%',
              padding: '10px',
              marginTop: '10px',
              background: '#f5f5f5',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            ← Retour au quiz
          </button>
        </div>
      </div>
    );
  }

  // Panneau admin
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
          <h1 style={{ color: '#333', margin: 0 }}>⚙️ Panneau Admin</h1>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleChangePassword}
              style={{
                padding: '10px 20px',
                background: '#f5f5f5',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              🔑 Changer le mot de passe
            </button>
            <button
              onClick={() => {
                setIsAuthenticated(false);
                // Supprimer l'authentification du localStorage
                if (typeof window !== 'undefined') {
                  localStorage.removeItem('adminAuthenticated');
                }
              }}
              style={{
                padding: '10px 20px',
                background: '#ffebee',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '14px',
                color: '#c62828'
              }}
            >
              🚪 Déconnexion
            </button>
            <button
              onClick={() => router.push('/')}
              style={{
                padding: '10px 20px',
                background: '#e3f2fd',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              ← Retour au quiz
            </button>
          </div>
        </div>

        {/* Section gestion des sessions */}
        <div style={{
          background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
          padding: '25px',
          borderRadius: '15px',
          marginBottom: '30px',
          boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)'
        }}>
          <h2 style={{ color: 'white', margin: '0 0 20px 0', fontSize: '24px' }}>
            📋 Gestion des Sessions
          </h2>
          <p style={{ color: 'rgba(255, 255, 255, 0.9)', marginBottom: '20px', fontSize: '14px' }}>
            Visualisez et gérez toutes les sessions. Vous pouvez voir leur état et les supprimer si nécessaire.
          </p>
          <div style={{
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '10px',
            padding: '20px',
            maxHeight: '500px',
            overflowY: 'auto'
          }}>
            {sessions.length === 0 ? (
              <p style={{ color: '#666', textAlign: 'center', fontStyle: 'italic' }}>
                Aucune session pour le moment
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {sessions.map((session) => {
                  const isActive = session.isActive || false;
                  const currentIndex = session.currentQuestionIndex ?? -1;
                  const surveyId = session.surveyId || null;
                  const createdAt = session.createdAt?.toDate?.() || null;
                  const adminName = session.adminName || 'Non défini';
                  
                  return (
                    <div
                      key={session.id}
                      style={{
                        background: 'white',
                        padding: '15px',
                        borderRadius: '8px',
                        border: '2px solid #e0e0e0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '15px'
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                          <h3 style={{ margin: 0, fontSize: '18px', color: '#333' }}>
                            Session: {session.id}
                          </h3>
                          <span style={{
                            padding: '4px 12px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: '600',
                            background: isActive ? '#4caf50' : '#f5f5f5',
                            color: isActive ? 'white' : '#666'
                          }}>
                            {isActive ? '🟢 Active' : '⚪ Inactive'}
                          </span>
                        </div>
                        <div style={{ fontSize: '14px', color: '#666', marginBottom: '4px' }}>
                          <strong>Sondage:</strong> {surveyId ? (
                            <span style={{ color: '#667eea' }}>{surveyId}</span>
                          ) : (
                            <span style={{ color: '#999', fontStyle: 'italic' }}>Aucun</span>
                          )}
                        </div>
                        <div style={{ fontSize: '14px', color: '#666', marginBottom: '4px' }}>
                          <strong>Question actuelle:</strong> {currentIndex === -1 ? (
                            <span style={{ color: '#999', fontStyle: 'italic' }}>Non démarrée</span>
                          ) : (
                            <span style={{ color: '#667eea' }}>Question {currentIndex + 1}</span>
                          )}
                        </div>
                        <div style={{ fontSize: '14px', color: '#666', marginBottom: '4px' }}>
                          <strong>Admin:</strong> {adminName}
                        </div>
                        {createdAt && (
                          <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                            Créée le: {createdAt.toLocaleDateString('fr-FR')} à {createdAt.toLocaleTimeString('fr-FR')}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <button
                          onClick={() => router.push(`/admin/edit/${session.id}`)}
                          style={{
                            padding: '8px 16px',
                            background: '#2196f3',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: '500'
                          }}
                        >
                          ✏️ Éditer
                        </button>
                        <button
                          onClick={() => {
                            showConfirm(
                              'Confirmer la suppression',
                              `Êtes-vous sûr de vouloir supprimer la session "${session.id}" ?\n\nCette action est irréversible et supprimera toutes les données associées (participants, réponses, etc.).`,
                              async () => {
                                try {
                                  const sessionRef = doc(db, 'sessions', session.id);
                                  await deleteDoc(sessionRef);
                                  await loadSessions();
                                  showAlert('Succès', 'Session supprimée avec succès');
                                } catch (error) {
                                  console.error('Erreur lors de la suppression:', error);
                                  showAlert('Erreur', 'Erreur lors de la suppression de la session');
                                }
                              }
                            );
                          }}
                          style={{
                            padding: '8px 16px',
                            background: '#f44336',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: '500'
                          }}
                        >
                          🗑️ Supprimer
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Section gestion des sondages */}
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '25px',
          borderRadius: '15px',
          marginBottom: '30px',
          boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)'
        }}>
          <h2 style={{ color: 'white', margin: '0 0 20px 0', fontSize: '24px' }}>
            📊 Gestion des Sondages
          </h2>
          <p style={{ color: 'rgba(255, 255, 255, 0.9)', marginBottom: '20px', fontSize: '14px' }}>
            Créez et gérez vos sondages. Un même sondage peut être utilisé par plusieurs sessions.
          </p>
          <button
            onClick={() => router.push('/admin/surveys')}
            style={{
              padding: '15px 30px',
              background: 'white',
              color: '#667eea',
              border: 'none',
              borderRadius: '10px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            📋 Gérer les sondages
          </button>
        </div>

        {/* Section associer un sondage à une session */}
        <div style={{
          background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
          padding: '25px',
          borderRadius: '15px',
          marginBottom: '40px',
          boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)'
        }}>
          <h2 style={{ color: 'white', margin: '0 0 20px 0', fontSize: '24px' }}>
            🔗 Associer un Sondage à une Session
          </h2>
          <p style={{ color: 'rgba(255, 255, 255, 0.9)', marginBottom: '20px', fontSize: '14px' }}>
            Entrez un ID de session et l&apos;ID du sondage à associer. La session sera créée automatiquement si elle n&apos;existe pas.
          </p>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="ID de session (ex: 1)"
              value={sessionIdInput}
              onChange={(e) => setSessionIdInput(e.target.value)}
              style={{
                flex: 1,
                minWidth: '200px',
                padding: '15px',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '10px',
                fontSize: '16px',
                background: 'rgba(255, 255, 255, 0.95)'
              }}
            />
            <select
              id="surveyIdSelect"
              value={selectedSurveyId}
              onChange={(e) => setSelectedSurveyId(e.target.value)}
              style={{
                flex: 1,
                minWidth: '200px',
                padding: '15px',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '10px',
                fontSize: '16px',
                background: 'rgba(255, 255, 255, 0.95)',
                cursor: 'pointer'
              }}
            >
              <option value="">-- Sélectionner un sondage --</option>
              {surveys.map((survey) => (
                <option key={survey.id} value={survey.id}>
                  {survey.name || survey.id}
                </option>
              ))}
            </select>
            <button
              onClick={async () => {
                if (!sessionIdInput.trim()) {
                  showAlert('Erreur', 'Veuillez entrer un ID de session');
                  return;
                }
                if (!selectedSurveyId) {
                  showAlert('Erreur', 'Veuillez sélectionner un sondage');
                  return;
                }
                
                try {
                  // Créer ou mettre à jour la session avec le sondage associé
                  // Ne pas mettre adminName - il sera défini par le premier participant qui rejoint
                  const sessionRef = doc(db, 'sessions', sessionIdInput.trim());
                  const sessionDoc = await getDoc(sessionRef);
                  
                  await setDoc(sessionRef, {
                    surveyId: selectedSurveyId,
                    currentQuestionIndex: -1,
                    isActive: false,
                    createdAt: sessionDoc.exists() ? sessionDoc.data().createdAt : new Date(),
                    // Pas d'adminName ici - sera défini par le premier participant qui rejoint
                  }, { merge: true });

                  const selectedSurvey = surveys.find(s => s.id === selectedSurveyId);
                  const surveyName = selectedSurvey?.name || selectedSurveyId;
                  showAlert('Succès', `Sondage "${surveyName}" associé à la session "${sessionIdInput.trim()}" avec succès !\n\nLa première personne qui rejoindra cette session deviendra l'administrateur.`);
                  setSelectedSurveyId('');
                  setSessionIdInput('');
                  // Recharger la liste des sessions
                  await loadSessions();
                } catch (error: any) {
                  console.error('Erreur:', error);
                  showAlert('Erreur', 'Erreur lors de l\'association: ' + (error?.message || 'Erreur inconnue'));
                }
              }}
              style={{
                padding: '15px 30px',
                background: 'white',
                color: '#f5576c',
                border: 'none',
                borderRadius: '10px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              🔗 Associer
            </button>
          </div>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '30px'
        }}>
          <h2 style={{ color: '#555', margin: 0 }}>Gestion des Questions (Globales)</h2>
          <button
            onClick={() => {
              setShowQuestionForm(true);
              setEditingQuestion(null);
              setNewQuestion({
                question: '',
                options: ['', '', '', ''],
                correct: 0,
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
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '10px', fontWeight: '600' }}>
                Options de réponse :
              </label>
              {newQuestion.options.map((option, index) => (
                <div key={index} style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="radio"
                    name="correct"
                    checked={newQuestion.correct === index}
                    onChange={() => setNewQuestion({ ...newQuestion, correct: index })}
                  />
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
                  {newQuestion.correct === index && (
                    <span style={{ color: '#4caf50', fontWeight: '600' }}>✓ Correcte</span>
                  )}
                </div>
              ))}
            </div>
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
                    correct: 0,
                  });
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
          <h3 style={{ marginBottom: '20px' }}>Questions existantes ({questions.length})</h3>
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
                        Question {question.id}: {question.question}
                      </div>
                      <div style={{ marginLeft: '20px' }}>
                        {question.options.map((option, index) => (
                          <div
                            key={index}
                            style={{
                              padding: '8px',
                              margin: '5px 0',
                              background: index === question.correct ? '#e8f5e9' : 'white',
                              borderRadius: '5px',
                              border: index === question.correct ? '2px solid #4caf50' : '1px solid #e0e0e0'
                            }}
                          >
                            {index + 1}. {option}
                            {index === question.correct && (
                              <span style={{ marginLeft: '10px', color: '#4caf50', fontWeight: '600' }}>
                                ✓ Correcte
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
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

