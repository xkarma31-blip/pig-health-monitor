import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useTheme, ThemeColors } from '../../theme';
import { useAuth } from '../../utils/auth';

import { EmptyState, Badge, SegmentedControl, ActionButton } from '../../components/primitives';
import { ChevronRightIcon, RefreshIcon, PlusIcon, LockIcon } from '../../components/primitives/Icons';

type ModelStatus = 'idle' | 'training' | 'trained' | 'deployed' | 'error';

interface EdgeImpulseModel {
  id: string;
  name: string;
  version: string;
  status: ModelStatus;
  accuracy?: number;
  f1Score?: number;
  precision?: number;
  recall?: number;
  trainingTime?: number;
  modelSize?: string;
  lastTrained?: number;
  deployedTo?: string[];
  classes: string[];
  description: string;
}

interface TrainingJob {
  id: string;
  modelId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  startTime: number;
  endTime?: number;
  logs: string[];
}

const MOCK_MODELS: EdgeImpulseModel[] = [
  {
    id: 'ei-pig-thermal-v1',
    name: 'Pig Thermal Classifier v1',
    version: '1.0.0',
    status: 'deployed',
    accuracy: 0.94,
    f1Score: 0.92,
    precision: 0.93,
    recall: 0.91,
    trainingTime: 1847,
    modelSize: '2.4 MB',
    lastTrained: Date.now() - 1000 * 60 * 60 * 24 * 3,
    deployedTo: ['node-b (MLX90640)'],
    classes: ['normal', 'elevated', 'fever', 'critical'],
    description: 'Thermal anomaly detection for pig health monitoring using MLX90640 32x24 thermal camera data.',
  },
  {
    id: 'ei-pig-audio-v1',
    name: 'Pig Vocalization Classifier v1',
    version: '1.0.0',
    status: 'trained',
    accuracy: 0.87,
    f1Score: 0.84,
    precision: 0.86,
    recall: 0.82,
    trainingTime: 3241,
    modelSize: '1.8 MB',
    lastTrained: Date.now() - 1000 * 60 * 60 * 24 * 7,
    deployedTo: [],
    classes: ['normal', 'cough', 'distress', 'feeding', 'aggression'],
    description: 'Audio classification for pig vocalizations using MEMS microphone array.',
  },
  {
    id: 'ei-pig-thermal-v2',
    name: 'Pig Thermal Classifier v2',
    version: '2.0.0-beta',
    status: 'training',
    trainingTime: 0,
    modelSize: '—',
    classes: ['normal', 'elevated', 'fever', 'critical', 'hypothermia'],
    description: 'Enhanced thermal model with hypothermia detection and improved fever specificity.',
  },
];

const MOCK_TRAINING_JOBS: TrainingJob[] = [
  {
    id: 'job-001',
    modelId: 'ei-pig-thermal-v2',
    status: 'running',
    progress: 0.67,
    startTime: Date.now() - 1000 * 60 * 45,
    logs: [
      '[00:00] Initializing training job...',
      '[00:15] Loading dataset: 12,847 samples',
      '[00:45] Preprocessing thermal frames...',
      '[01:30] Starting epoch 1/50',
      '[12:45] Epoch 15/50 — val_acc: 0.89',
      '[24:30] Epoch 30/50 — val_acc: 0.91',
      '[36:15] Epoch 45/50 — val_acc: 0.92',
    ],
  },
];

const getStatusColors = (status: ModelStatus, colors: ThemeColors) => {
  switch (status) {
    case 'idle': return { bg: colors.surface, text: colors.info, border: colors.border };
    case 'training': return { bg: colors.surface, text: colors.warning, border: colors.border };
    case 'trained': return { bg: colors.surface, text: colors.success, border: colors.border };
    case 'deployed': return { bg: colors.surface, text: colors.success, border: colors.border };
    case 'error': return { bg: colors.surface, text: colors.error, border: colors.border };
  }
};

const STATUS_LABELS: Record<ModelStatus, string> = {
  idle: 'IDLE',
  training: 'TRAINING',
  trained: 'TRAINED',
  deployed: 'DEPLOYED',
  error: 'ERROR',
};

const formatDuration = (ms: number) => {
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
};

const formatTimeAgo = (timestamp: number) => {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
};

export default function EdgeImpulseWebScreen() {
  useAuth();
  const { colors } = useTheme();

  const [models, setModels] = useState<EdgeImpulseModel[]>([]);
  const [jobs, setJobs] = useState<TrainingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'models' | 'training' | 'deployment'>('models');
  const [selectedModel, setSelectedModel] = useState<EdgeImpulseModel | null>(null);
  const [showModelDetail, setShowModelDetail] = useState(false);

  const loadData = useCallback(async () => {
    await new Promise(resolve => setTimeout(resolve, 800));
    setModels(MOCK_MODELS);
    setJobs(MOCK_TRAINING_JOBS);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
    // Simulate training progress
    const interval = setInterval(() => {
      setJobs(prev => prev.map(job => {
        if (job.status === 'running' && job.progress < 1) {
          const newProgress = Math.min(1, job.progress + 0.02);
          if (newProgress >= 1) {
            return {
              ...job,
              status: 'completed',
              progress: 1,
              endTime: Date.now(),
              logs: [...job.logs, '[48:00] Training completed successfully!', '[48:05] Model validation passed (acc: 0.92)'],
            };
          }
          return {
            ...job,
            progress: newProgress,
            logs: [...job.logs, `[${Math.floor((Date.now() - job.startTime) / 60000).toString().padStart(2, '0')}:${Math.floor(((Date.now() - job.startTime) % 60000) / 1000).toString().padStart(2, '0')}] Epoch ${Math.floor(job.progress * 50)}/50 — val_acc: ${(0.85 + job.progress * 0.1).toFixed(2)}`],
          };
        }
        return job;
      }));
    }, 3000);
    return () => clearInterval(interval);
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleModelPress = (model: EdgeImpulseModel) => {
    setSelectedModel(model);
    setShowModelDetail(true);
  };

  const handleDeploy = (modelId: string) => {
    setModels(prev => prev.map(model =>
      model.id === modelId
        ? { ...model, status: 'deployed', deployedTo: [...(model.deployedTo || []), 'node-a'] }
        : model
    ));
  };

  const handleTrain = (modelId: string) => {
    setModels(prev => prev.map(model =>
      model.id === modelId
        ? { ...model, status: 'training', trainingTime: 0 }
        : model
    ));
    setJobs(prev => [...prev, {
      id: `job-${Date.now()}`,
      modelId,
      status: 'queued',
      progress: 0,
      startTime: Date.now(),
      logs: ['[00:00] Queued for training...'],
    }]);
  };

  const modelsTab = (
    <View style={styles.tabContent}>
      {loading ? (
        <View style={styles.loading}>
          <Text style={styles.loadingText}>Loading models...</Text>
        </View>
      ) : models.length === 0 ? (
        <EmptyState
          icon={<LockIcon size={48} />}
          title="No AI Models"
          message="Train your first Edge Impulse model to get started"
        />
      ) : (
        <View style={styles.modelsList}>
          {models.map((model) => {
            const statusColors = getStatusColors(model.status, colors);
            return (
              <TouchableOpacity
                key={model.id}
                style={[styles.modelCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => handleModelPress(model)}
                accessibilityRole="button"
                accessibilityLabel={`View ${model.name} details`}
                accessibilityHint={`View AI model ${model.name} with ${model.accuracy ? (model.accuracy * 100).toFixed(1) : 'unknown'}% accuracy`}
              >
                <View style={styles.modelCardHeader}>
                  <View style={[styles.statusBadge, { backgroundColor: statusColors.bg + '20' }]}>
                    <Text style={[styles.statusText, { color: statusColors.text }]}>
                      {STATUS_LABELS[model.status]}
                    </Text>
                  </View>
                  <Text style={[styles.modelVersion, { color: colors.textSecondary }]}>
                    v{model.version}
                  </Text>
                </View>
                <Text style={[styles.modelName, { color: colors.textPrimary }]}>{model.name}</Text>
                <Text style={[styles.modelDescription, { color: colors.textSecondary }]}>
                  {model.description}
                </Text>
                {model.accuracy && (
                  <View style={styles.modelMetrics}>
                    <Text style={[styles.metric, { color: colors.textSecondary }]}>
                      Accuracy: {(model.accuracy * 100).toFixed(1)}%
                    </Text>
                    {model.f1Score && (
                      <Text style={[styles.metric, { color: colors.textSecondary }]}>
                        F1: {(model.f1Score * 100).toFixed(1)}%
                      </Text>
                    )}
                  </View>
                )}
                <View style={styles.modelActions}>
                  {model.status === 'trained' && (
                    <ActionButton
                      onPress={() => handleDeploy(model.id)}
                      accessibilityLabel={`Deploy ${model.name}`}
                      accessibilityHint={`Deploy AI model ${model.name} to production`}
                    >
                      <RefreshIcon size={16} />
                      <Text style={styles.actionButtonText}>Deploy</Text>
                    </ActionButton>
                  )}
                  {model.status === 'deployed' && (
                    <Text style={[styles.deployedText, { color: colors.success }]}>
                      Deployed to {model.deployedTo?.join(', ')}
                    </Text>
                  )}
                  {model.status === 'idle' && (
                    <ActionButton
                      onPress={() => handleTrain(model.id)}
                      accessibilityLabel={`Train ${model.name}`}
                      accessibilityHint={`Start training for AI model ${model.name}`}
                    >
                      <PlusIcon size={16} />
                      <Text style={styles.actionButtonText}>Train</Text>
                    </ActionButton>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );

  const trainingTab = (
    <View style={styles.tabContent}>
      {loading ? (
        <View style={styles.loading}>
          <Text style={styles.loadingText}>Loading training jobs...</Text>
        </View>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={<LockIcon size={48} />}
          title="No Training Jobs"
          message="Start training an AI model to see progress here"
        />
      ) : (
        <View style={styles.jobsList}>
          {jobs.map((job) => {
            const model = models.find(m => m.id === job.modelId);
            return (
              <View key={job.id} style={[styles.jobCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.jobHeader}>
                  <Text style={[styles.jobModelName, { color: colors.textPrimary }]}>
                    {model?.name || 'Unknown Model'}
                  </Text>
                  <Badge
                    label={job.status.toUpperCase()}
                    status={job.status === 'completed' ? 'info' : job.status === 'failed' ? 'critical' : 'high'}
                  />
                </View>
                {job.status === 'running' && (
                  <View style={styles.progressContainer}>
                    <View style={[styles.progressBar, { width: `${job.progress * 100}%` }]} />
                    <Text style={[styles.progressText, { color: colors.textSecondary }]}>
                      {Math.round(job.progress * 100)}%
                    </Text>
                  </View>
                )}
                <View style={styles.jobDetails}>
                  <Text style={[styles.jobDetail, { color: colors.textSecondary }]}>
                    Started: {formatTimeAgo(job.startTime)}
                  </Text>
                  {job.endTime && (
                    <Text style={[styles.jobDetail, { color: colors.textSecondary }]}>
                      Duration: {formatDuration(job.endTime - job.startTime)}
                    </Text>
                  )}
                </View>
                <View style={styles.jobLogs}>
                  <Text style={[styles.logsTitle, { color: colors.textSecondary }]}>Recent Logs:</Text>
                  <ScrollView style={styles.logsContent}>
                    {job.logs.slice(-5).map((log, index) => (
                      <Text key={index} style={[styles.logEntry, { color: colors.textSecondary, fontSize: 12 }]}>
                        {log}
                      </Text>
                    ))}
                  </ScrollView>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Edge Impulse AI</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Machine Learning Models for Pig Health Monitoring
        </Text>
      </View>

      <SegmentedControl
        options={[
          { key: 'models', label: 'Models' },
          { key: 'training', label: 'Training' },
          { key: 'deployment', label: 'Deployment' },
        ]}
        value={activeTab}
        onChange={(key) => setActiveTab(key as 'models' | 'training' | 'deployment')}
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {activeTab === 'models' && modelsTab}
        {activeTab === 'training' && trainingTab}
        {activeTab === 'deployment' && (
          <View style={styles.tabContent}>
            <Text style={[styles.deploymentText, { color: colors.textSecondary }]}>
              Deployment configuration coming soon...
            </Text>
          </View>
        )}
      </ScrollView>

      {showModelDetail && selectedModel && (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                {selectedModel.name}
              </Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowModelDetail(false)}
                accessibilityRole="button"
                accessibilityLabel="Close model details"
                accessibilityHint="Close detailed model view"
              >
                <ChevronRightIcon size={24} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>
              {selectedModel.description}
            </Text>
            <View style={styles.modalMetrics}>
              {selectedModel.accuracy && (
                <View style={styles.metricRow}>
                  <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Accuracy:</Text>
                  <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
                    {(selectedModel.accuracy * 100).toFixed(1)}%
                  </Text>
                </View>
              )}
              {selectedModel.f1Score && (
                <View style={styles.metricRow}>
                  <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>F1 Score:</Text>
                  <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
                    {(selectedModel.f1Score * 100).toFixed(1)}%
                  </Text>
                </View>
              )}
              {selectedModel.precision && (
                <View style={styles.metricRow}>
                  <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Precision:</Text>
                  <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
                    {(selectedModel.precision * 100).toFixed(1)}%
                  </Text>
                </View>
              )}
              {selectedModel.recall && (
                <View style={styles.metricRow}>
                  <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Recall:</Text>
                  <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
                    {(selectedModel.recall * 100).toFixed(1)}%
                  </Text>
                </View>
              )}
              {selectedModel.modelSize && (
                <View style={styles.metricRow}>
                  <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Model Size:</Text>
                  <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
                    {selectedModel.modelSize}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.modalClasses}>
              <Text style={[styles.classesTitle, { color: colors.textSecondary }]}>Classes:</Text>
              <View style={styles.classesList}>
                {selectedModel.classes.map((cls, index) => (
                  <Badge key={index} label={cls} status="info" />
                ))}
              </View>
            </View>
            <View style={styles.modalActions}>
              {selectedModel.status === 'trained' && (
                <ActionButton
                  onPress={() => handleDeploy(selectedModel.id)}
                  accessibilityLabel={`Deploy ${selectedModel.name}`}
                  accessibilityHint={`Deploy AI model ${selectedModel.name} to production`}
                >
                  <RefreshIcon size={16} />
                  <Text style={styles.actionButtonText}>Deploy</Text>
                </ActionButton>
              )}
              {selectedModel.status === 'deployed' && (
                <Text style={[styles.deployedText, { color: colors.success }]}>
                  Deployed to {selectedModel.deployedTo?.join(', ')}
                </Text>
              )}
              {selectedModel.status === 'idle' && (
                <ActionButton
                  onPress={() => handleTrain(selectedModel.id)}
                  accessibilityLabel={`Train ${selectedModel.name}`}
                  accessibilityHint={`Start training for AI model ${selectedModel.name}`}
                >
                  <PlusIcon size={16} />
                  <Text style={styles.actionButtonText}>Train</Text>
                </ActionButton>
              )}
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
  },
  segmentedControl: {
    marginHorizontal: 20,
    marginBottom: 16,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  tabContent: {
    flex: 1,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#888',
  },
  modelsList: {
    gap: 16,
  },
  modelCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  modelCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  modelVersion: {
    fontSize: 12,
    fontWeight: '600',
  },
  modelName: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  modelDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  modelMetrics: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  metric: {
    fontSize: 12,
    fontWeight: '600',
  },
  modelActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deployedText: {
    fontSize: 12,
    fontWeight: '600',
  },
  jobsList: {
    gap: 16,
  },
  jobCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  jobModelName: {
    fontSize: 16,
    fontWeight: '700',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: '#00D4AA',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 48,
    textAlign: 'right',
  },
  jobDetails: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  jobDetail: {
    fontSize: 12,
    fontWeight: '500',
  },
  jobLogs: {
    marginBottom: 12,
  },
  logsTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  logsContent: {
    maxHeight: 120,
  },
  logEntry: {
    fontFamily: 'monospace',
    marginBottom: 4,
    lineHeight: 18,
  },
  deploymentText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 40,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
    zIndex: 100,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    maxHeight: '90%',
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  modalMetrics: {
    gap: 12,
    marginBottom: 20,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalClasses: {
    marginBottom: 20,
  },
  classesTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  classesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});