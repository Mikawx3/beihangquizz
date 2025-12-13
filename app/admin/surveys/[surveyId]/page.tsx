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
} from 'firebase/firestore';
import Modal from '@/app/components/Modal';

interface Option {
  text: string;
  image?: string; // Nom de fichier ou URL d'image
  // Le son sera le même pour toutes les animations (roulement de tambour)
}

interface Question {
  id: string;
  question: string;
  options: (string | Option)[]; // Supporte les strings simples (rétrocompatibilité) ou des objets Option
  type?: 'multiple-choice' | 'ranking' | 'pairing' | 'categorization';
  optionsRef?: string; // Référence à une liste partagée
  categoryA?: string; // Nom de la première catégorie (pour type categorization)
  categoryB?: string; // Nom de la deuxième catégorie (pour type categorization)
}

// Fonction helper pour normaliser les options (convertir string en Option si nécessaire)
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

// Fonction helper pour nettoyer une option (enlever les champs undefined)
const cleanOption = (option: string | Option): string | Option => {
  if (typeof option === 'string') {
    return option;
  }
  const cleaned: Option = { text: option.text };
  if (option.image) {
    cleaned.image = option.image;
  }
  // On ne garde plus le son, il sera le même pour toutes les animations
  return cleaned;
};

// Fonction helper pour nettoyer une question avant sauvegarde
const cleanQuestionForSave = (question: Omit<Question, 'id'>): Omit<Question, 'id'> => {
  const cleaned: Omit<Question, 'id'> = {
    question: question.question,
    options: question.options.map(cleanOption),
    type: question.type || 'multiple-choice',
    optionsRef: question.optionsRef || undefined,
  };
  // Ajouter categoryA et categoryB seulement si c'est une question de type categorization
  if (question.type === 'categorization') {
    cleaned.categoryA = question.categoryA || 'Catégorie A';
    cleaned.categoryB = question.categoryB || 'Catégorie B';
  }
  return cleaned;
};

export default function EditSurvey() {
  const params = useParams();
  const router = useRouter();
  const surveyId = params.surveyId as string;
  
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [showJsonImport, setShowJsonImport] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [newQuestion, setNewQuestion] = useState<Omit<Question, 'id'>>({
    question: '',
    options: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
    type: 'multiple-choice',
    categoryA: 'Catégorie A',
    categoryB: 'Catégorie B',
  });
  const [rankingOrder, setRankingOrder] = useState<number[]>([]);
  const [surveyExists, setSurveyExists] = useState(false);
  const [surveyName, setSurveyName] = useState('');
  const [importedQuestions, setImportedQuestions] = useState<Omit<Question, 'id'>[]>([]);
  
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

  // Charger le sondage et ses questions
  const loadSurvey = useCallback(async () => {
    try {
      const surveyRef = doc(db, 'surveys', surveyId);
      const surveyDoc = await getDoc(surveyRef);
      
      if (surveyDoc.exists()) {
        setSurveyExists(true);
        setSurveyName(surveyDoc.data().name || surveyId);
      } else {
        setSurveyExists(false);
      }

      // Charger les questions du sondage
      const questionsRef = collection(db, 'surveys', surveyId, 'questions');
      const snapshot = await getDocs(questionsRef);
      const loadedQuestions: Question[] = [];
      snapshot.forEach((doc) => {
        loadedQuestions.push({ id: doc.id, ...doc.data() } as Question);
      });
      loadedQuestions.sort((a, b) => a.id.localeCompare(b.id));
      setQuestions(loadedQuestions);
    } catch (error: any) {
      console.error('Erreur lors du chargement:', error);
    }
  }, [surveyId]);

  useEffect(() => {
    if (surveyId) {
      loadSurvey();
    }
  }, [surveyId, loadSurvey]);

  // Créer le sondage s'il n'existe pas
  const createSurvey = async () => {
    try {
      const surveyRef = doc(db, 'surveys', surveyId);
      await setDoc(surveyRef, {
        name: surveyName || `Sondage ${surveyId}`,
        createdAt: new Date(),
      });
      setSurveyExists(true);
      showAlert('Succès', 'Sondage créé avec succès !');
    } catch (error) {
      console.error('Erreur lors de la création:', error);
      showAlert('Erreur', 'Erreur lors de la création du sondage');
    }
  };

  // Parser le JSON et afficher l'aperçu
  const handleJsonImport = async () => {
    try {
      if (!jsonInput.trim()) {
        showAlert('Erreur', 'Veuillez entrer du contenu JSON');
        return;
      }

      // Vérifier si le JSON contient des "..." qui sont invalides
      if (jsonInput.includes('...') && !jsonInput.includes('"..."')) {
        showAlert('Erreur', 'Le JSON contient "..." qui n\'est pas valide. Remplacez "..." par la liste complète des éléments ou supprimez-le.');
        return;
      }

      let parsed: any;
      let parseError: any = null;
      try {
        parsed = JSON.parse(jsonInput);
      } catch (error) {
        parseError = error;
        // Essayer le format ligne par ligne uniquement si le JSON est vraiment invalide
        const lines = jsonInput.split('\n').filter((l: string) => l.trim());
        if (lines.length >= 5) {
          parsed = [];
          for (let i = 0; i < lines.length; i += 5) {
            if (i + 4 < lines.length) {
              parsed.push({
                question: lines[i].trim(),
                options: [
                  lines[i + 1].trim(),
                  lines[i + 2].trim(),
                  lines[i + 3].trim(),
                  lines[i + 4].trim(),
                ],
                type: 'multiple-choice',
              });
            }
          }
        } else {
          showAlert('Erreur', `Format JSON invalide: ${parseError?.message || 'Erreur de parsing'}. Vérifiez que votre JSON est valide (pas de "..." dans les tableaux, guillemets corrects, virgules correctes).`);
          return;
        }
      }

      // Vérifier que parsed existe et est valide
      if (!parsed) {
        showAlert('Erreur', 'Impossible de parser le JSON. Vérifiez le format.');
        return;
      }

      // Extraire les listes de réponses partagées si elles existent
      // Supporte maintenant les options avec image et son
      const sharedOptions: Record<string, (string | Option)[]> = parsed.sharedOptions || {};

      // Fonction helper pour normaliser une option depuis le JSON
      const normalizeOptionFromJson = (opt: any): Option => {
        if (typeof opt === 'string') {
          return { text: opt };
        }
        if (typeof opt === 'object' && opt !== null) {
          const normalized: Option = {
            text: opt.text || opt.name || String(opt),
          };
          // Ajouter l'image seulement si elle existe
          if (opt.image) {
            normalized.image = opt.image;
          }
          // On ne garde plus le son, il sera le même pour toutes les animations
          return normalized;
        }
        return { text: String(opt) };
      };

      // Fonction helper pour parser les options d'une question
      const parseOptions = (q: any, sharedOpts: Record<string, (string | Option)[]>): (string | Option)[] => {
        // Si la question référence une liste partagée
        if (q.optionsRef) {
          if (sharedOpts[q.optionsRef]) {
            return sharedOpts[q.optionsRef].map(normalizeOptionFromJson);
          } else {
            return [];
          }
        }
        
        // Sinon, utiliser les options directement définies
        const rawOptions = q.options || q.choices || [];
        if (!Array.isArray(rawOptions)) {
          return [];
        }
        
        // Normaliser chaque option
        return rawOptions.map(normalizeOptionFromJson);
      };

      let questionsToAdd: Omit<Question, 'id'>[] = [];

      // Priorité 1: Format avec sharedOptions et questions
      if (parsed && parsed.questions && Array.isArray(parsed.questions)) {
        questionsToAdd = parsed.questions
          .filter((q: any) => q && (q.question || q.text))
          .map((q: any) => {
            const questionType = q.type || 'multiple-choice';
            const options = parseOptions(q, sharedOptions);
            
            return {
              question: q.question || q.text || '',
              options: options,
              type: questionType as 'multiple-choice' | 'ranking' | 'pairing' | 'categorization',
              optionsRef: q.optionsRef || undefined,
              categoryA: q.categoryA || undefined,
              categoryB: q.categoryB || undefined,
            };
          });
      }
      // Priorité 2: Array de questions directement
      else if (Array.isArray(parsed)) {
        questionsToAdd = parsed
          .filter((q: any) => q && (q.question || q.text))
          .map((q: any) => {
            const questionType = q.type || 'multiple-choice';
            const options = parseOptions(q, sharedOptions);
            
            return {
              question: q.question || q.text || '',
              options: options,
              type: questionType as 'multiple-choice' | 'ranking' | 'pairing' | 'categorization',
              optionsRef: q.optionsRef || undefined,
              categoryA: q.categoryA || undefined,
              categoryB: q.categoryB || undefined,
            };
          });
      }
      // Priorité 3: Objet unique avec une question
      else if (parsed && (parsed.question || parsed.text)) {
        const questionType = parsed.type || 'multiple-choice';
        const options = parseOptions(parsed, sharedOptions);
        
        questionsToAdd = [{
          question: parsed.question || parsed.text || '',
          options: options,
          type: (questionType === 'ranking' ? 'ranking' : questionType === 'pairing' ? 'pairing' : questionType === 'categorization' ? 'categorization' : 'multiple-choice') as 'multiple-choice' | 'ranking' | 'pairing' | 'categorization',
          categoryA: parsed.categoryA || undefined,
          categoryB: parsed.categoryB || undefined,
          optionsRef: parsed.optionsRef || undefined,
        }];
      }

      // Valider les questions
      questionsToAdd = questionsToAdd.filter((q) => {
        if (!q.question.trim()) return false;
        if (!Array.isArray(q.options) || q.options.length < 2) {
          // Si une référence est utilisée mais la liste n'existe pas, afficher une erreur
          if (q.optionsRef) {
            showAlert('Erreur', `La référence "${q.optionsRef}" n'existe pas dans sharedOptions pour la question: "${q.question}"`);
            return false;
          }
          return false;
        }
        return true;
      });

      if (questionsToAdd.length === 0) {
        showAlert('Erreur', 'Aucune question valide trouvée dans le JSON.');
        return;
      }

      setImportedQuestions(questionsToAdd);
      showAlert('Succès', `${questionsToAdd.length} question(s) importée(s) ! Utilisez le bouton "Sauvegarder" pour les enregistrer.`);
    } catch (error) {
      console.error('Erreur lors de l\'import JSON:', error);
      showAlert('Erreur', `Erreur lors de l'import JSON: ${error instanceof Error ? error.message : 'Erreur inconnue'}. Vérifiez le format.`);
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
          const questionRef = doc(db, 'surveys', surveyId, 'questions', questionId);
          const cleanedQuestion = cleanQuestionForSave(q);
          await setDoc(questionRef, cleanedQuestion);
        })
      );

      showAlert('Succès', `${importedQuestions.length} question(s) sauvegardée(s) avec succès !`);
      setImportedQuestions([]);
      setJsonInput('');
      setShowJsonImport(false);
      await loadSurvey();
    } catch (saveError: any) {
      console.error('Erreur lors de la sauvegarde:', saveError);
      if (saveError?.code === 'permission-denied' || saveError?.message?.includes('permission')) {
        showAlert('Erreur', 'Erreur de permissions Firebase. Vérifiez les règles Firestore.');
      } else {
        showAlert('Erreur', 'Erreur lors de la sauvegarde: ' + (saveError?.message || 'Erreur inconnue'));
      }
    }
  };

  // Ajouter ou modifier une question
  const handleSaveQuestion = async () => {
    if (!newQuestion.question.trim()) {
      showAlert('Erreur', 'Veuillez entrer une question');
      return;
    }
    if (newQuestion.options.some(opt => !getOptionText(opt).trim())) {
      showAlert('Erreur', 'Veuillez remplir toutes les options');
      return;
    }

    try {
      const questionId = editingQuestion 
        ? editingQuestion.id 
        : `q${Date.now()}`;

      const questionRef = doc(db, 'surveys', surveyId, 'questions', questionId);
      const cleanedQuestion = cleanQuestionForSave(newQuestion);
      await setDoc(questionRef, cleanedQuestion);

      await loadSurvey();
      setShowQuestionForm(false);
      setEditingQuestion(null);
      setNewQuestion({
        question: '',
        options: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
        type: 'multiple-choice',
        categoryA: 'Catégorie A',
        categoryB: 'Catégorie B',
      });
      setRankingOrder([]);
      showAlert('Succès', editingQuestion ? 'Question modifiée avec succès' : 'Question ajoutée avec succès');
    } catch (error: any) {
      console.error('Erreur lors de la sauvegarde:', error);
      if (error?.code === 'permission-denied' || error?.message?.includes('permission')) {
        showAlert('Erreur', 'Erreur de permissions Firebase. Vérifiez les règles Firestore.');
      } else {
        showAlert('Erreur', 'Erreur lors de la sauvegarde: ' + (error?.message || 'Erreur inconnue'));
      }
    }
  };

  // Supprimer une question
  const handleDeleteQuestion = async (id: string) => {
    if (!surveyId || !id) {
      showAlert('Erreur', 'Erreur: Survey ID ou Question ID manquant');
      return;
    }

    showConfirm(
      'Confirmer la suppression',
      'Êtes-vous sûr de vouloir supprimer cette question ?',
      async () => {
        try {
          console.log('🗑️ Suppression de la question:', id, 'dans le sondage:', surveyId);
          const questionRef = doc(db, 'surveys', surveyId, 'questions', id);
          await deleteDoc(questionRef);
          console.log('✅ Question supprimée avec succès');
          await loadSurvey();
          showAlert('Succès', 'Question supprimée avec succès');
        } catch (error: any) {
          console.error('❌ Erreur lors de la suppression:', error);
          if (error?.code === 'permission-denied' || error?.message?.includes('permission')) {
            showAlert('Erreur', 'Erreur de permissions Firebase. Vérifiez les règles Firestore.');
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
      options: question.options.map(opt => normalizeOption(opt)),
      type: question.type || 'multiple-choice',
      categoryA: question.categoryA || 'Catégorie A',
      categoryB: question.categoryB || 'Catégorie B',
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
            <h1 style={{ color: '#333', margin: 0 }}>📝 Édition Sondage</h1>
            <p style={{ color: '#666', marginTop: '5px' }}>{surveyName || surveyId}</p>
            {!surveyExists && (
              <p style={{ color: '#f44336', marginTop: '10px' }}>
                ⚠️ Ce sondage n&apos;existe pas encore. Créez-le pour commencer.
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {!surveyExists && (
              <button
                onClick={createSurvey}
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
                ✅ Créer le sondage
              </button>
            )}
            <button
              onClick={() => router.push('/admin/surveys')}
              style={{
                padding: '10px 20px',
                background: '#f5f5f5',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              ← Liste des sondages
            </button>
            <button
              onClick={() => router.push('/admin')}
              style={{
                padding: '10px 20px',
                background: '#e3f2fd',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              ← Panneau admin
            </button>
          </div>
        </div>

        {surveyExists && (
          <>
            {/* Même interface que pour l'édition de session mais pour les sondages */}
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
                      options: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
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

            {/* Section import JSON - même code que dans edit/[sessionId] */}
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
                  <br />• <strong>Nouveau :</strong> Objet avec listes partagées : <code>{`{sharedOptions: {...}, questions: [...]}`}</code>
                  <br />
                  <br /><strong>Types de questions disponibles :</strong>
                  <br />• <code>&quot;multiple-choice&quot;</code> : Choix multiple
                  <br />• <code>&quot;ranking&quot;</code> : Classement/Tri
                  <br />• <code>&quot;pairing&quot;</code> : Association de couples (sélectionner deux personnes)
                  <br />• <code>&quot;categorization&quot;</code> : Catégorisation (classer chaque personne dans l&apos;une de deux catégories) - nécessite <code>categoryA</code> et <code>categoryB</code>
                  <br />
                  <br /><strong>Listes de réponses partagées :</strong>
                  <br />Vous pouvez définir des listes de réponses partagées dans <code>sharedOptions</code> et les référencer dans les questions avec <code>optionsRef</code>.
                  <br />
                  <br /><strong>Options avec image :</strong>
                  <br />Chaque option peut être un objet avec <code>text</code> et <code>image</code> (optionnel).
                  <br />Exemple : <code>{`{text: "Scooby", image: "scooby.png"}`}</code>
                  <br />Le son (roulement de tambour) sera le même pour toutes les animations de révélation.
                </p>
                <textarea
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  placeholder={`Exemple avec listes partagées (IMPORTANT: pas de "..." dans le JSON):\n{\n  "sharedOptions": {\n    "personnes": ["Alice", "Bob", "Charlie", "Diana", "Eve"],\n    "villes": ["Paris", "Lyon", "Marseille", "Nice"]\n  },\n  "questions": [\n    {\n      "question": "Qui préférez-vous ?",\n      "optionsRef": "personnes",\n      "type": "multiple-choice"\n    },\n    {\n      "question": "Classer ces personnes par préférence",\n      "optionsRef": "personnes",\n      "type": "ranking"\n    },\n    {\n      "question": "Quelle ville préférez-vous ?",\n      "optionsRef": "villes",\n      "type": "multiple-choice"\n    }\n  ]\n}\n\nExemple classique (sans listes partagées):\n[\n  {\n    "question": "Quelle est votre couleur préférée ?",\n    "options": ["Rouge", "Bleu", "Vert", "Jaune"],\n    "type": "multiple-choice"\n  },\n  {\n    "question": "Classer ces villes du nord au sud",\n    "options": ["Paris", "Lyon", "Marseille", "Nice"],\n    "type": "ranking"\n  }\n]`}
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
                        Type: {question.type === 'ranking' ? 'Classement / Tri' : question.type === 'pairing' ? 'Association de couples' : question.type === 'categorization' ? 'Catégorisation (2 catégories)' : 'Choix multiple'}
                        {question.optionsRef && (
                          <span style={{ marginLeft: '10px', color: '#1976d2', fontWeight: '600' }}>
                            📎 Liste partagée: &quot;{question.optionsRef}&quot;
                          </span>
                        )}
                      </div>
                      <div style={{ marginLeft: '15px' }}>
                        {question.options && question.options.length > 0 ? (
                          question.options.map((option, optIndex) => {
                            const opt = normalizeOption(option);
                            return (
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
                                {optIndex + 1}. {opt.text}
                                {opt.image && (
                                  <span style={{ marginLeft: '8px', color: '#999', fontSize: '12px' }}>
                                    (image: {opt.image})
                                  </span>
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <div style={{ 
                            padding: '8px', 
                            margin: '4px 0', 
                            background: '#fff3cd', 
                            borderRadius: '5px', 
                            fontSize: '13px',
                            color: '#856404',
                            fontStyle: 'italic'
                          }}>
                            ⚠️ Aucune option trouvée. {question.optionsRef ? `Vérifiez que la référence "${question.optionsRef}" existe dans sharedOptions.` : 'Les options doivent être définies.'}
                          </div>
                        )}
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

            {/* Formulaire d'ajout/modification de question - même code que edit/[sessionId] */}
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
                    const newType = e.target.value as 'multiple-choice' | 'ranking' | 'pairing' | 'categorization';
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
                  <option value="pairing">Association de couples</option>
                  <option value="categorization">Catégorisation (2 catégories)</option>
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
                    {newQuestion.options.map((option, index) => {
                      const opt = normalizeOption(option);
                      return (
                        <div key={index} style={{ marginBottom: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                            <span style={{ width: '20px', textAlign: 'center', color: '#999' }}>{index + 1}.</span>
                            <input
                              type="text"
                              placeholder={`Option ${index + 1}`}
                              value={opt.text}
                              onChange={(e) => {
                                const newOptions = [...newQuestion.options];
                                const currentOpt = normalizeOption(newOptions[index]);
                                newOptions[index] = { ...currentOpt, text: e.target.value };
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
                          <div style={{ marginLeft: '30px', marginTop: '5px' }}>
                            <input
                              type="text"
                              placeholder="Image (optionnel)"
                              value={opt.image || ''}
                              onChange={(e) => {
                                const newOptions = [...newQuestion.options];
                                const currentOpt = normalizeOption(newOptions[index]);
                                newOptions[index] = { ...currentOpt, image: e.target.value || undefined };
                                setNewQuestion({ ...newQuestion, options: newOptions });
                              }}
                              style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #e0e0e0',
                                borderRadius: '6px',
                                fontSize: '12px'
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {newQuestion.type === 'pairing' && (
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '10px', fontWeight: '600' }}>
                      Options disponibles (les participants pourront sélectionner deux personnes parmi cette liste) :
                    </label>
                    {newQuestion.options.map((option, index) => {
                      const opt = normalizeOption(option);
                      return (
                        <div key={index} style={{ marginBottom: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                            <span style={{ width: '20px', textAlign: 'center', color: '#999' }}>{index + 1}.</span>
                            <input
                              type="text"
                              placeholder={`Option ${index + 1}`}
                              value={opt.text}
                              onChange={(e) => {
                                const newOptions = [...newQuestion.options];
                                const currentOpt = normalizeOption(newOptions[index]);
                                newOptions[index] = { ...currentOpt, text: e.target.value };
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
                          <div style={{ marginLeft: '30px', marginTop: '5px' }}>
                            <input
                              type="text"
                              placeholder="Image (optionnel)"
                              value={opt.image || ''}
                              onChange={(e) => {
                                const newOptions = [...newQuestion.options];
                                const currentOpt = normalizeOption(newOptions[index]);
                                newOptions[index] = { ...currentOpt, image: e.target.value || undefined };
                                setNewQuestion({ ...newQuestion, options: newOptions });
                              }}
                              style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #e0e0e0',
                                borderRadius: '6px',
                                fontSize: '12px'
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => {
                        const newOptions = [...newQuestion.options, { text: '' }];
                        setNewQuestion({ ...newQuestion, options: newOptions });
                      }}
                      style={{
                        padding: '8px 16px',
                        background: '#e3f2fd',
                        color: '#1976d2',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        cursor: 'pointer',
                        marginRight: '10px',
                        marginTop: '10px'
                      }}
                    >
                      + Ajouter une option
                    </button>
                    {newQuestion.options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => {
                          const newOptions = newQuestion.options.slice(0, -1);
                          setNewQuestion({ ...newQuestion, options: newOptions });
                        }}
                        style={{
                          padding: '8px 16px',
                          background: '#ffebee',
                          color: '#c62828',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '14px',
                          cursor: 'pointer',
                          marginTop: '10px'
                        }}
                      >
                        - Supprimer la dernière option
                      </button>
                    )}
                  </div>
                )}
                {newQuestion.type === 'categorization' && (
                  <div style={{ marginBottom: '15px' }}>
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'block', marginBottom: '10px', fontWeight: '600' }}>
                        Nom de la première catégorie :
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Type A, Introverti, Matinal..."
                        value={newQuestion.categoryA || 'Catégorie A'}
                        onChange={(e) => setNewQuestion({ ...newQuestion, categoryA: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '10px',
                          border: '2px solid #e0e0e0',
                          borderRadius: '8px',
                          fontSize: '14px'
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'block', marginBottom: '10px', fontWeight: '600' }}>
                        Nom de la deuxième catégorie :
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Type B, Extraverti, Nocturne..."
                        value={newQuestion.categoryB || 'Catégorie B'}
                        onChange={(e) => setNewQuestion({ ...newQuestion, categoryB: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '10px',
                          border: '2px solid #e0e0e0',
                          borderRadius: '8px',
                          fontSize: '14px'
                        }}
                      />
                    </div>
                    <label style={{ display: 'block', marginBottom: '10px', fontWeight: '600' }}>
                      Personnes à classer (les participants devront classer chaque personne dans l&apos;une des deux catégories) :
                    </label>
                    {newQuestion.options.map((option, index) => {
                      const opt = normalizeOption(option);
                      return (
                        <div key={index} style={{ marginBottom: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                            <span style={{ width: '20px', textAlign: 'center', color: '#999' }}>{index + 1}.</span>
                            <input
                              type="text"
                              placeholder={`Personne ${index + 1}`}
                              value={opt.text}
                              onChange={(e) => {
                                const newOptions = [...newQuestion.options];
                                const currentOpt = normalizeOption(newOptions[index]);
                                newOptions[index] = { ...currentOpt, text: e.target.value };
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
                          <div style={{ marginLeft: '30px', marginTop: '5px' }}>
                            <input
                              type="text"
                              placeholder="Image (optionnel)"
                              value={opt.image || ''}
                              onChange={(e) => {
                                const newOptions = [...newQuestion.options];
                                const currentOpt = normalizeOption(newOptions[index]);
                                newOptions[index] = { ...currentOpt, image: e.target.value || undefined };
                                setNewQuestion({ ...newQuestion, options: newOptions });
                              }}
                              style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #e0e0e0',
                                borderRadius: '6px',
                                fontSize: '12px'
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
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
                              value={getOptionText(newQuestion.options[optionIndex])}
                              onChange={(e) => {
                                const newOptions = [...newQuestion.options];
                                const currentOpt = normalizeOption(newOptions[optionIndex]);
                                newOptions[optionIndex] = { ...currentOpt, text: e.target.value };
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
                        const newOptions = [...newQuestion.options, { text: '' }];
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
                        categoryA: 'Catégorie A',
                        categoryB: 'Catégorie B',
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

            {/* Liste des questions */}
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
                              {question.options.map((option, index) => {
                                const opt = normalizeOption(option);
                                return (
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
                                    {index + 1}. {opt.text}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {question.type === 'pairing' && (
                            <div style={{ marginLeft: '20px' }}>
                              <p style={{ fontSize: '14px', color: '#666', marginBottom: '10px', fontStyle: 'italic' }}>
                                Type: Association de couples
                              </p>
                              <div>
                                {question.options.map((option, index) => {
                                  const opt = normalizeOption(option);
                                  return (
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
                                      {index + 1}. {opt.text}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {question.type === 'ranking' && (
                            <div style={{ marginLeft: '20px' }}>
                              <p style={{ fontSize: '14px', color: '#666', marginBottom: '10px', fontStyle: 'italic' }}>
                                Type: Classement / Tri
                              </p>
                              <div>
                                {question.options.map((option, index) => {
                                  const opt = normalizeOption(option);
                                  return (
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
                                      {index + 1}. {opt.text}
                                    </div>
                                  );
                                })}
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
