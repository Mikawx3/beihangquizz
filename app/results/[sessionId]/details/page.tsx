'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import {
  doc,
  getDoc,
  collection,
  getDocs,
} from 'firebase/firestore';

interface Option {
  text: string;
  image?: string;
}

interface Question {
  id: string;
  question: string;
  options: (string | Option)[];
  type?: 'multiple-choice' | 'ranking' | 'pairing' | 'categorization';
  categoryA?: string;
  categoryB?: string;
}

interface Participant {
  id: string;
  name: string;
  answers: { [questionIndex: number]: any };
  isActive?: boolean;
}

// Fonction helper pour normaliser les options
const normalizeOption = (option: string | Option): Option => {
  if (typeof option === 'string') {
    return { text: option };
  }
  return option;
};

// Fonction helper pour obtenir le texte d'une option
const getOptionText = (option: string | Option): string => {
  if (typeof option === 'string') {
    return option;
  }
  return option.text;
};

export default function SessionResultsDetails() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;
  
  const [session, setSession] = useState<any>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [surveyName, setSurveyName] = useState('');
  const [selectedParticipant, setSelectedParticipant] = useState<string | null>(null);

  // Charger les données de la session
  const loadSessionData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const sessionRef = doc(db, 'sessions', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      
      if (!sessionDoc.exists()) {
        setError('Session non trouvée');
        setLoading(false);
        return;
      }
      
      const sessionData: any = { id: sessionDoc.id, ...sessionDoc.data() };
      setSession(sessionData);
      
      // Charger les participants
      const participantsRef = collection(db, 'sessions', sessionId, 'participants');
      const participantsSnapshot = await getDocs(participantsRef);
      const loadedParticipants: Participant[] = [];
      participantsSnapshot.forEach((doc) => {
        loadedParticipants.push({ id: doc.id, ...doc.data() } as Participant);
      });
      setParticipants(loadedParticipants);
      
      // Charger les questions depuis le sondage
      const surveyId: string | undefined = sessionData?.surveyId;
      if (surveyId) {
        const surveyRef = doc(db, 'surveys', surveyId);
        const surveyDoc = await getDoc(surveyRef);
        
        if (surveyDoc.exists()) {
          setSurveyName(surveyDoc.data().name || surveyId);
        }
        
        const questionsRef = collection(db, 'surveys', surveyId, 'questions');
        const questionsSnapshot = await getDocs(questionsRef);
        const loadedQuestions: Question[] = [];
        questionsSnapshot.forEach((doc) => {
          loadedQuestions.push({ id: doc.id, ...doc.data() } as Question);
        });
        loadedQuestions.sort((a, b) => a.id.localeCompare(b.id));
        setQuestions(loadedQuestions);
      }
    } catch (error: any) {
      console.error('Erreur lors du chargement:', error);
      setError('Erreur lors du chargement des résultats: ' + (error?.message || 'Erreur inconnue'));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) {
      loadSessionData();
    }
  }, [sessionId, loadSessionData]);

  // Calculer la similarité entre deux participants (pour les questions de type pairing/ranking)
  const calculateSimilarity = useCallback((p1: Participant, p2: Participant) => {
    let matches = 0;
    let totalQuestions = 0;

    questions.forEach((question, questionIndex) => {
      const answer1 = p1.answers?.[questionIndex];
      const answer2 = p2.answers?.[questionIndex];

      if (answer1 !== undefined && answer2 !== undefined && answer1 !== null && answer2 !== null) {
        totalQuestions++;

        if (question.type === 'multiple-choice') {
          if (answer1 === answer2) matches++;
        } else if (question.type === 'ranking') {
          // Pour ranking, calculer la corrélation de rang
          if (Array.isArray(answer1) && Array.isArray(answer2) && answer1.length === answer2.length) {
            // Calculer la distance de Spearman simplifiée
            let rankDiff = 0;
            for (let i = 0; i < answer1.length; i++) {
              const pos1 = answer1.indexOf(i);
              const pos2 = answer2.indexOf(i);
              if (pos1 !== -1 && pos2 !== -1) {
                rankDiff += Math.abs(pos1 - pos2);
              }
            }
            // Plus la différence est petite, plus c'est similaire
            const maxDiff = (answer1.length * (answer1.length - 1)) / 2;
            matches += 1 - (rankDiff / maxDiff);
          }
        } else if (question.type === 'pairing') {
          // Pour pairing, vérifier si les mêmes couples sont choisis
          if (Array.isArray(answer1) && Array.isArray(answer2)) {
            const couples1 = new Set<string>();
            const couples2 = new Set<string>();
            for (let i = 0; i < answer1.length; i += 2) {
              if (i + 1 < answer1.length) {
                const [a, b] = answer1[i] < answer1[i + 1] 
                  ? [answer1[i], answer1[i + 1]] 
                  : [answer1[i + 1], answer1[i]];
                couples1.add(`${a},${b}`);
              }
            }
            for (let i = 0; i < answer2.length; i += 2) {
              if (i + 1 < answer2.length) {
                const [a, b] = answer2[i] < answer2[i + 1] 
                  ? [answer2[i], answer2[i + 1]] 
                  : [answer2[i + 1], answer2[i]];
                couples2.add(`${a},${b}`);
              }
            }
            const intersection = new Set([...couples1].filter(x => couples2.has(x)));
            const union = new Set([...couples1, ...couples2]);
            if (union.size > 0) {
              matches += intersection.size / union.size;
            }
          }
        } else if (question.type === 'categorization') {
          // Pour categorization, comparer les catégorisations
          if (typeof answer1 === 'object' && typeof answer2 === 'object' && !Array.isArray(answer1) && !Array.isArray(answer2)) {
            let sameCategories = 0;
            let totalPersons = 0;
            const allKeys = new Set([...Object.keys(answer1 || {}), ...Object.keys(answer2 || {})]);
            allKeys.forEach(key => {
              if (answer1[key] !== undefined && answer2[key] !== undefined) {
                totalPersons++;
                if (answer1[key] === answer2[key]) {
                  sameCategories++;
                }
              }
            });
            if (totalPersons > 0) {
              matches += sameCategories / totalPersons;
            }
          }
        }
      }
    });

    return totalQuestions > 0 ? (matches / totalQuestions) * 100 : 0;
  }, [questions]);

  // Calculer les statistiques de similarité pour un participant
  const getSimilarityStats = useCallback((participant: Participant) => {
    const similarities = participants
      .filter(p => p.id !== participant.id)
      .map(p => ({
        participant: p,
        similarity: calculateSimilarity(participant, p)
      }))
      .sort((a, b) => b.similarity - a.similarity);

    return similarities;
  }, [participants, calculateSimilarity]);

  // Calculer les préférences d'un participant (quelle réponse/option il a le plus choisie)
  const getParticipantPreferences = useCallback((participant: Participant) => {
    // Utiliser un Map pour regrouper par texte d'option (car les mêmes options peuvent apparaître dans différentes questions)
    const optionCounts = new Map<string, { count: number; questionType: string; optionIndex: number }>();
    
    const categorization: { categoryA: number; categoryB: number } = { categoryA: 0, categoryB: 0 };

    questions.forEach((question, questionIndex) => {
      const answer = participant.answers?.[questionIndex];
      if (answer === undefined || answer === null) return;

      if (question.type === 'multiple-choice') {
        const optionIndex = answer as number;
        if (optionIndex >= 0 && optionIndex < question.options.length) {
          const opt = normalizeOption(question.options[optionIndex]);
          const key = `multiple-choice-${opt.text}`;
          const current = optionCounts.get(key) || { count: 0, questionType: 'Choix', optionIndex };
          optionCounts.set(key, { 
            count: current.count + 1, 
            questionType: 'Choix',
            optionIndex: optionIndex
          });
        }
      } else if (question.type === 'ranking') {
        if (Array.isArray(answer) && answer.length > 0) {
          // Compter combien de fois chaque option est en première position (position 0)
          const firstPlaceOption = answer[0];
          if (typeof firstPlaceOption === 'number' && firstPlaceOption >= 0 && firstPlaceOption < question.options.length) {
            const opt = normalizeOption(question.options[firstPlaceOption]);
            const key = `ranking-${opt.text}`;
            const current = optionCounts.get(key) || { count: 0, questionType: 'Classement (1ère place)', optionIndex: firstPlaceOption };
            optionCounts.set(key, { 
              count: current.count + 1, 
              questionType: 'Classement (1ère place)',
              optionIndex: firstPlaceOption
            });
          }
        }
      } else if (question.type === 'pairing') {
        if (Array.isArray(answer)) {
          // Compter combien de fois chaque option apparaît dans un couple
          answer.forEach((optionIndex: number) => {
            if (typeof optionIndex === 'number' && optionIndex >= 0 && optionIndex < question.options.length) {
              const opt = normalizeOption(question.options[optionIndex]);
              const key = `pairing-${opt.text}`;
              const current = optionCounts.get(key) || { count: 0, questionType: 'Association (dans un couple)', optionIndex: optionIndex };
              optionCounts.set(key, { 
                count: current.count + 1, 
                questionType: 'Association (dans un couple)',
                optionIndex: optionIndex
              });
            }
          });
        }
      } else if (question.type === 'categorization') {
        if (typeof answer === 'object' && !Array.isArray(answer)) {
          // Compter les catégorisations
          Object.values(answer).forEach((categoryIndex: any) => {
            if (categoryIndex === 0) {
              categorization.categoryA++;
            } else if (categoryIndex === 1) {
              categorization.categoryB++;
            }
          });
        }
      }
    });

    return { optionCounts, categorization };
  }, [questions]);

  // Obtenir les options les plus choisies par un participant
  const getTopPreferences = useCallback((participant: Participant) => {
    const { optionCounts, categorization } = getParticipantPreferences(participant);
    const results: Array<{ type: string; optionText: string; count: number; questionType: string }> = [];

    // Convertir le Map en tableau
    optionCounts.forEach((value, key) => {
      const optionText = key.split('-').slice(1).join('-'); // Retirer le préfixe type-
      results.push({
        type: key.split('-')[0],
        optionText,
        count: value.count,
        questionType: value.questionType
      });
    });

    // Trier par nombre de fois choisi (décroissant)
    return results.sort((a, b) => b.count - a.count);
  }, [getParticipantPreferences]);

  // Obtenir les réponses d'un participant sous forme lisible
  const getParticipantAnswer = (participant: Participant, questionIndex: number) => {
    const question = questions[questionIndex];
    if (!question) return null;

    const answer = participant.answers?.[questionIndex];
    if (answer === undefined || answer === null) return null;

    if (question.type === 'multiple-choice') {
      const opt = normalizeOption(question.options[answer as number]);
      return opt.text;
    } else if (question.type === 'ranking') {
      if (Array.isArray(answer)) {
        return answer.map((optIndex: number, position: number) => {
          const opt = normalizeOption(question.options[optIndex]);
          return `${position + 1}. ${opt.text}`;
        }).join(', ');
      }
    } else if (question.type === 'pairing') {
      if (Array.isArray(answer)) {
        const couples: string[] = [];
        for (let i = 0; i < answer.length; i += 2) {
          if (i + 1 < answer.length) {
            const opt1 = normalizeOption(question.options[answer[i]]);
            const opt2 = normalizeOption(question.options[answer[i + 1]]);
            couples.push(`${opt1.text} ↔ ${opt2.text}`);
          }
        }
        return couples.join(', ');
      }
    } else if (question.type === 'categorization') {
      if (typeof answer === 'object' && !Array.isArray(answer)) {
        const categoryA = question.categoryA || 'Catégorie A';
        const categoryB = question.categoryB || 'Catégorie B';
        const results: string[] = [];
        question.options.forEach((opt, optIndex) => {
          const optText = getOptionText(opt);
          const category = answer[optIndex] === 0 ? categoryA : categoryB;
          results.push(`${optText}: ${category}`);
        });
        return results.join(', ');
      }
    }

    return String(answer);
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '20px'
      }}>
        <div style={{
          background: 'white',
          padding: '40px',
          borderRadius: '20px',
          textAlign: 'center'
        }}>
          <p style={{ fontSize: '18px', color: '#666' }}>Chargement des résultats...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '20px'
      }}>
        <div style={{
          background: 'white',
          padding: '40px',
          borderRadius: '20px',
          textAlign: 'center',
          maxWidth: '500px'
        }}>
          <h2 style={{ color: '#f44336', marginBottom: '15px' }}>❌ Erreur</h2>
          <p style={{ fontSize: '16px', color: '#666', marginBottom: '20px' }}>{error}</p>
          <button
            onClick={() => router.push('/')}
            style={{
              padding: '12px 24px',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: '600'
            }}
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  const createdAt = session?.createdAt?.toDate?.() || null;
  const displayedParticipant = selectedParticipant 
    ? participants.find(p => p.id === selectedParticipant)
    : null;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        background: 'white',
        borderRadius: '20px',
        padding: '40px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
      }}>
        {/* En-tête */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '30px',
          flexWrap: 'wrap',
          gap: '15px'
        }}>
          <div>
            <h1 style={{ color: '#333', margin: 0, fontSize: '28px' }}>👥 Votes détaillés par personne</h1>
            <p style={{ color: '#666', marginTop: '5px', fontSize: '16px' }}>
              {sessionId} {surveyName && `- ${surveyName}`}
            </p>
            {createdAt && (
              <p style={{ color: '#999', marginTop: '5px', fontSize: '14px' }}>
                Créée le: {createdAt.toLocaleDateString('fr-FR')} à {createdAt.toLocaleTimeString('fr-FR')}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={() => window.print()}
              style={{
                padding: '12px 24px',
                background: '#2196f3',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              🖨️ Imprimer
            </button>
            <button
              onClick={() => router.push(`/results/${sessionId}`)}
              style={{
                padding: '12px 24px',
                background: '#4caf50',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '600'
              }}
            >
              ← Vue d'ensemble
            </button>
            <button
              onClick={() => router.push('/')}
              style={{
                padding: '12px 24px',
                background: '#f5f5f5',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '16px'
              }}
            >
              Accueil
            </button>
          </div>
        </div>

        {/* Liste des participants */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
          gap: '15px',
          marginBottom: '30px'
        }}>
          {participants.map((participant) => {
            const answerCount = Object.keys(participant.answers || {}).length;
            const isSelected = selectedParticipant === participant.id;
            const similarities = getSimilarityStats(participant);
            const mostSimilar = similarities[0];

            return (
              <div
                key={participant.id}
                onClick={() => setSelectedParticipant(participant.id)}
                style={{
                  background: isSelected ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#f9f9f9',
                  color: isSelected ? 'white' : '#333',
                  padding: '20px',
                  borderRadius: '15px',
                  border: isSelected ? 'none' : '2px solid #e0e0e0',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  boxShadow: isSelected ? '0 4px 15px rgba(0, 0, 0, 0.2)' : 'none'
                }}
              >
                <h3 style={{
                  margin: '0 0 10px 0',
                  fontSize: '18px',
                  fontWeight: '600'
                }}>
                  {participant.name || participant.id}
                </h3>
                <div style={{
                  fontSize: '14px',
                  opacity: 0.9,
                  marginBottom: '8px'
                }}>
                  {answerCount} question{answerCount > 1 ? 's' : ''} répondue{answerCount > 1 ? 's' : ''}
                </div>
                {mostSimilar && (
                  <div style={{
                    fontSize: '12px',
                    opacity: 0.8,
                    marginTop: '10px',
                    paddingTop: '10px',
                    borderTop: `1px solid ${isSelected ? 'rgba(255,255,255,0.3)' : '#e0e0e0'}`
                  }}>
                    💡 Plus proche de: <strong>{mostSimilar.participant.name || mostSimilar.participant.id}</strong><br />
                    ({mostSimilar.similarity.toFixed(1)}% de similarité)
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Détails du participant sélectionné */}
        {displayedParticipant && (
          <div style={{
            background: '#f9f9f9',
            padding: '30px',
            borderRadius: '15px',
            border: '2px solid #e0e0e0'
          }}>
            <h2 style={{
              color: '#333',
              marginBottom: '20px',
              fontSize: '24px'
            }}>
              Réponses de {displayedParticipant.name || displayedParticipant.id}
            </h2>

            {/* Statistiques de préférences */}
            <div style={{
              background: 'white',
              padding: '20px',
              borderRadius: '10px',
              marginBottom: '30px',
              border: '1px solid #e0e0e0'
            }}>
              <h3 style={{
                color: '#555',
                marginBottom: '15px',
                fontSize: '18px'
              }}>
                🎯 Réponses les plus choisies
              </h3>
              {(() => {
                const topPrefs = getTopPreferences(displayedParticipant);
                const categorizationPrefs = getParticipantPreferences(displayedParticipant).categorization;
                
                if (topPrefs.length === 0 && categorizationPrefs.categoryA === 0 && categorizationPrefs.categoryB === 0) {
                  return (
                    <p style={{ color: '#999', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
                      Pas assez de données pour calculer les préférences
                    </p>
                  );
                }

                return (
                  <div>
                    {topPrefs.length > 0 && (
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                        gap: '15px',
                        marginBottom: '20px'
                      }}>
                        {topPrefs.slice(0, 10).map((pref, index) => (
                          <div
                            key={`${pref.type}-${pref.optionText}-${index}`}
                            style={{
                              background: index === 0 ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#f5f5f5',
                              color: index === 0 ? 'white' : '#333',
                              padding: '15px',
                              borderRadius: '10px',
                              border: index === 0 ? 'none' : '2px solid #e0e0e0',
                              textAlign: 'center'
                            }}
                          >
                            {index === 0 && (
                              <div style={{ fontSize: '24px', marginBottom: '5px' }}>👑</div>
                            )}
                            <div style={{
                              fontWeight: '600',
                              fontSize: '14px',
                              marginBottom: '5px',
                              opacity: index === 0 ? 1 : 0.9
                            }}>
                              {pref.optionText}
                            </div>
                            <div style={{
                              fontSize: '20px',
                              fontWeight: 'bold',
                              marginBottom: '3px'
                            }}>
                              {pref.count}x
                            </div>
                            <div style={{
                              fontSize: '11px',
                              opacity: 0.8
                            }}>
                              {pref.questionType}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {(categorizationPrefs.categoryA > 0 || categorizationPrefs.categoryB > 0) && (
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '15px',
                        marginTop: '20px'
                      }}>
                        <div style={{
                          background: '#e8f5e9',
                          padding: '15px',
                          borderRadius: '10px',
                          textAlign: 'center',
                          border: '2px solid #4caf50'
                        }}>
                          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#4caf50' }}>
                            {categorizationPrefs.categoryA}x
                          </div>
                          <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                            Catégorie A
                          </div>
                        </div>
                        <div style={{
                          background: '#fff3e0',
                          padding: '15px',
                          borderRadius: '10px',
                          textAlign: 'center',
                          border: '2px solid #ff9800'
                        }}>
                          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ff9800' }}>
                            {categorizationPrefs.categoryB}x
                          </div>
                          <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                            Catégorie B
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Statistiques de similarité */}
            <div style={{
              background: 'white',
              padding: '20px',
              borderRadius: '10px',
              marginBottom: '30px',
              border: '1px solid #e0e0e0'
            }}>
              <h3 style={{
                color: '#555',
                marginBottom: '15px',
                fontSize: '18px'
              }}>
                📊 Comparaison avec les autres participants
              </h3>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '10px'
              }}>
                {getSimilarityStats(displayedParticipant).map(({ participant, similarity }) => (
                  <div
                    key={participant.id}
                    style={{
                      background: similarity > 70 ? '#e8f5e9' : similarity > 50 ? '#fff3e0' : '#fce4ec',
                      padding: '12px',
                      borderRadius: '8px',
                      border: `2px solid ${similarity > 70 ? '#4caf50' : similarity > 50 ? '#ff9800' : '#e91e63'}`
                    }}
                  >
                    <div style={{
                      fontWeight: '600',
                      fontSize: '14px',
                      marginBottom: '5px'
                    }}>
                      {participant.name || participant.id}
                    </div>
                    <div style={{
                      fontSize: '18px',
                      fontWeight: 'bold',
                      color: similarity > 70 ? '#4caf50' : similarity > 50 ? '#ff9800' : '#e91e63'
                    }}>
                      {similarity.toFixed(1)}%
                    </div>
                    <div style={{
                      fontSize: '11px',
                      color: '#666',
                      marginTop: '5px'
                    }}>
                      {similarity > 70 ? 'Très similaire' : similarity > 50 ? 'Similaire' : 'Différent'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Réponses détaillées */}
            <div>
              <h3 style={{
                color: '#555',
                marginBottom: '20px',
                fontSize: '18px'
              }}>
                📝 Détails des réponses
              </h3>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '20px'
              }}>
                {questions.map((question, questionIndex) => {
                  const answer = getParticipantAnswer(displayedParticipant, questionIndex);
                  
                  return (
                    <div
                      key={questionIndex}
                      style={{
                        background: 'white',
                        padding: '20px',
                        borderRadius: '10px',
                        border: '1px solid #e0e0e0'
                      }}
                    >
                      <div style={{
                        fontWeight: '600',
                        fontSize: '16px',
                        marginBottom: '10px',
                        color: '#333'
                      }}>
                        Question {questionIndex + 1}: {question.question}
                      </div>
                      <div style={{
                        fontSize: '14px',
                        color: '#666',
                        marginBottom: '10px',
                        padding: '8px',
                        background: '#e3f2fd',
                        borderRadius: '6px'
                      }}>
                        Type: {
                          question.type === 'multiple-choice' ? 'Choix' :
                          question.type === 'ranking' ? 'Classement / Tri' :
                          question.type === 'pairing' ? 'Association de couples' :
                          question.type === 'categorization' ? 'Catégorisation' :
                          'Autre'
                        }
                      </div>
                      {answer !== null ? (
                        <div style={{
                          fontSize: '15px',
                          color: '#333',
                          padding: '12px',
                          background: '#f5f5f5',
                          borderRadius: '6px',
                          fontWeight: '500'
                        }}>
                          {answer}
                        </div>
                      ) : (
                        <div style={{
                          fontSize: '14px',
                          color: '#999',
                          fontStyle: 'italic'
                        }}>
                          Aucune réponse
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {!displayedParticipant && (
          <div style={{
            textAlign: 'center',
            padding: '40px',
            color: '#999',
            fontStyle: 'italic'
          }}>
            Sélectionnez un participant pour voir ses réponses détaillées
          </div>
        )}
      </div>

      {/* Styles pour l'impression */}
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
          }
          button {
            display: none !important;
          }
          /* Afficher toutes les sections en mode impression */
          div[style*="display: grid"] {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}
