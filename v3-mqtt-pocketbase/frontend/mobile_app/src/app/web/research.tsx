import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TextInput, Button, FlatList } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../../theme';

interface ResearchPaper {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  published: string;
  url: string;
  relevance: number;
}

export default function ResearchScreen() {
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [papers, setPapers] = useState<ResearchPaper[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      flex: 1,
      padding: 20,
    },
    screen: {
      flex: 1,
      padding: 20,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: theme.colors.accent,
      marginBottom: 10,
    },
    subtitle: {
      fontSize: 16,
      color: theme.colors.textSecondary,
      marginBottom: 20,
    },
    searchContainer: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 20,
    },
    searchInput: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      color: theme.colors.textPrimary,
      borderRadius: 10,
      padding: 15,
      fontSize: 16,
    },
    error: {
      color: theme.colors.error,
      marginBottom: 10,
    },
    loading: {
      color: theme.colors.accent,
      marginBottom: 20,
      textAlign: 'center',
    },
    papersList: {
      flex: 1,
    },
    paperCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 10,
      padding: 20,
      marginBottom: 15,
    },
    paperTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: theme.colors.accent,
      marginBottom: 10,
    },
    paperAuthors: {
      fontSize: 14,
      color: theme.colors.textPrimary,
      marginBottom: 5,
    },
    paperAbstract: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginBottom: 10,
      lineHeight: 20,
    },
    paperPublished: {
      fontSize: 12,
      color: theme.colors.textDisabled,
      marginBottom: 5,
    },
    paperRelevance: {
      fontSize: 12,
      color: theme.colors.success,
      marginBottom: 10,
    },
  }), [theme]);

  const mockPapers: ResearchPaper[] = [
    {
      id: '1',
      title: 'Machine Learning for Livestock Health Monitoring',
      authors: ['Dr. Smith', 'Prof. Johnson'],
      abstract: 'This paper presents a comprehensive approach to using machine learning for monitoring livestock health through sensor data analysis.',
      published: '2024',
      url: 'https://example.com/paper1',
      relevance: 95,
    },
    {
      id: '2',
      title: 'Computer Vision in Pig Disease Detection',
      authors: ['Dr. Chen', 'Prof. Wang'],
      abstract: 'Advanced computer vision techniques for early detection of diseases in pig populations using thermal imaging.',
      published: '2023',
      url: 'https://example.com/paper2',
      relevance: 88,
    },
    {
      id: '3',
      title: 'Edge Computing for Agricultural IoT',
      authors: ['Dr. Brown', 'Prof. Davis'],
      abstract: 'Implementation of edge computing solutions for agricultural IoT systems to reduce latency and improve real-time processing.',
      published: '2024',
      url: 'https://example.com/paper3',
      relevance: 82,
    },
  ];

  const handleSearch = () => {
    if (!query.trim()) {
      setError('Please enter a search query');
      return;
    }

    setLoading(true);
    setError('');

    // Simulate API call
    setTimeout(() => {
      setPapers(mockPapers.filter(paper => 
        paper.title.toLowerCase().includes(query.toLowerCase()) ||
        paper.abstract.toLowerCase().includes(query.toLowerCase())
      ));
      setLoading(false);
    }, 1500);
  };

  const renderPaper = ({ item }: { item: ResearchPaper }) => (
    <View style={styles.paperCard}>
      <Text style={styles.paperTitle}>{item.title}</Text>
      <Text style={styles.paperAuthors}>Authors: {item.authors.join(', ')}</Text>
      <Text style={styles.paperAbstract}>{item.abstract}</Text>
      <Text style={styles.paperPublished}>Published: {item.published}</Text>
      <Text style={styles.paperRelevance}>Relevance: {item.relevance}%</Text>
      <Button title="Read Full Paper" onPress={() => {}} />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <ScrollView style={styles.content}>
        <View style={styles.screen}>
          <Text style={styles.title}>AI Research Assistant</Text>
          <Text style={styles.subtitle}>Search and analyze research papers</Text>
          
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Enter research topic..."
              value={query}
              onChangeText={setQuery}
            />
            <Button title="Search" onPress={handleSearch} disabled={loading} />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          {loading && <Text style={styles.loading}>Loading research papers...</Text>}

          <FlatList
            data={papers}
            renderItem={renderPaper}
            keyExtractor={(item) => item.id}
            style={styles.papersList}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
