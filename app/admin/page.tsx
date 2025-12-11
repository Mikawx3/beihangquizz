'use client';

import { useState, useEffect } from 'react';
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
  id: number;
  question: string;
  options: string[];
  correct: number;
}

export default function AdminPanel() {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [newQuestion, setNewQuestion] = useState<Omit<Question, 'id'>>({
    question: '',
    options: ['', '', '', ''],
    correct: 0,
  });
  const router = useRouter();

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

  // Charger les questions une fois authentifié
  useEffect(() => {
    if (isAuthenticated) {
      loadQuestions();
    }
  }, [isAuthenticated]);

  // Vérifier le mot de passe
  const handleLogin = async () => {
    if (!password.trim()) {
      alert('Veuillez entrer le mot de passe');
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
        setPassword('');
      } else {
        alert('Mot de passe incorrect');
        setPassword('');
      }
    } catch (error) {
      console.error('Erreur lors de la vérification:', error);
      alert('Erreur lors de la connexion');
    }
  };

  // Modifier le mot de passe admin
  const handleChangePassword = async () => {
    const newPassword = prompt('Nouveau mot de passe:');
    if (!newPassword || newPassword.length < 4) {
      alert('Le mot de passe doit contenir au moins 4 caractères');
      return;
    }

    try {
      const adminRef = doc(db, 'admin', 'config');
      await updateDoc(adminRef, { password: newPassword });
      setAdminPassword(newPassword);
      alert('Mot de passe modifié avec succès');
    } catch (error) {
      console.error('Erreur lors de la modification:', error);
      alert('Erreur lors de la modification du mot de passe');
    }
  };

  // Ajouter ou modifier une question
  const handleSaveQuestion = async () => {
    if (!newQuestion.question.trim()) {
      alert('Veuillez entrer une question');
      return;
    }
    if (newQuestion.options.some(opt => !opt.trim())) {
      alert('Veuillez remplir toutes les options');
      return;
    }
    if (newQuestion.correct < 0 || newQuestion.correct >= newQuestion.options.length) {
      alert('Veuillez sélectionner une réponse correcte valide');
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
      alert(editingQuestion ? 'Question modifiée avec succès' : 'Question ajoutée avec succès');
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      alert('Erreur lors de la sauvegarde');
    }
  };

  // Supprimer une question
  const handleDeleteQuestion = async (id: number) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette question ?')) {
      return;
    }

    try {
      const questionRef = doc(db, 'questions', String(id));
      await deleteDoc(questionRef);
      await loadQuestions();
      alert('Question supprimée avec succès');
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      alert('Erreur lors de la suppression');
    }
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
              onClick={() => setIsAuthenticated(false)}
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

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '30px'
        }}>
          <h2 style={{ color: '#555', margin: 0 }}>Gestion des Questions</h2>
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
    </div>
  );
}

