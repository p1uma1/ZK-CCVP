import React from 'react';
import { CheckCircle2, AlertCircle, Clock, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StatusMessage } from '../types/index';

interface StatusBoxProps {
  status: StatusMessage | null;
}

export const StatusBox: React.FC<StatusBoxProps> = ({ status }) => {
  return (
    <div className="card">
      <div className="card-header" style={{ marginBottom: '0.75rem', paddingBottom: '1rem' }}>
        <div className="card-icon"><Activity size={18} /></div>
        <div className="card-title">System Status</div>
      </div>
      <AnimatePresence mode="wait">
        {status ? (
          <motion.div
            key="status"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className={`status-box ${status.type}`}
          >
            {status.type === 'success' && <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 2 }} />}
            {status.type === 'error' && <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />}
            {status.type === 'info' && <Clock size={16} style={{ flexShrink: 0, marginTop: 2 }} />}
            <span style={{ fontWeight: 500 }}>{status.msg}</span>
          </motion.div>
        ) : (
          <div className="idle-state">
            <Activity size={32} className="idle-state-icon" />
            <div className="idle-state-text">Awaiting action</div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
