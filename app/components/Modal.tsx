'use client';

import { useEffect } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: 'confirm' | 'alert';
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  message,
  type = 'alert',
  onConfirm,
  confirmText = 'Confirmer',
  cancelText = 'Annuler',
}: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      // Empêcher le scroll du body quand la modal est ouverte
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '500px',
          width: '100%',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        <h2
          style={{
            margin: '0 0 16px 0',
            fontSize: '20px',
            fontWeight: '600',
            color: '#333',
          }}
        >
          {title}
        </h2>
        <p
          style={{
            margin: '0 0 24px 0',
            fontSize: '16px',
            color: '#666',
            whiteSpace: 'pre-line',
            lineHeight: '1.5',
          }}
        >
          {message}
        </p>
        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
          }}
        >
          {type === 'confirm' && (
            <button
              onClick={onClose}
              style={{
                padding: '10px 20px',
                background: '#f5f5f5',
                color: '#333',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                transition: 'background 0.2s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = '#e0e0e0';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = '#f5f5f5';
              }}
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={type === 'confirm' ? handleConfirm : onClose}
            style={{
              padding: '10px 20px',
              background: type === 'confirm' ? '#f44336' : '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'background 0.2s',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = type === 'confirm' ? '#d32f2f' : '#1976D2';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = type === 'confirm' ? '#f44336' : '#2196F3';
            }}
          >
            {type === 'confirm' ? confirmText : 'OK'}
          </button>
        </div>
      </div>
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}
