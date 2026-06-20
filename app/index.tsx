import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useCuration } from '../hooks/useCuration';
import { CurationOptions, Photo } from '../types';

// ─── Constants ───────────────────────────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get('window');
const GRID_ITEM_SIZE = (SCREEN_W - 48) / 3; // 3-column grid with 16px margins + 8px gaps

const COLORS = {
  bg: '#0C0C0C',
  surface: '#1A1A1A',
  border: '#2A2A2A',
  text: '#F0EEE8',
  muted: '#888880',
  accent: '#9B8FE0',
  accentDim: '#5C5490',
  danger: '#E07070',
  success: '#70E0A0',
};

// ─── Date helpers ────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ProgressBar({ value }: { value: number }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${value}%` }]} />
    </View>
  );
}

interface DateFieldProps {
  label: string;
  date: Date;
  onPress: () => void;
}

function DateField({ label, date, onPress }: DateFieldProps) {
  return (
    <TouchableOpacity style={styles.dateField} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.dateFieldLabel}>{label}</Text>
      <Text style={styles.dateFieldValue}>{formatDate(date)}</Text>
    </TouchableOpacity>
  );
}

interface PhotoThumbProps {
  photo: Photo;
  size: number;
  selected?: boolean;
  dimmed?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
}

function PhotoThumb({ photo, size, selected, dimmed, onPress, onLongPress }: PhotoThumbProps) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.thumb, { width: size, height: size }]}
    >
      <Image
        source={{ uri: photo.uri }}
        style={{ width: size, height: size, borderRadius: 8 }}
        resizeMode="cover"
      />
      {selected && <View style={styles.thumbSelectedRing} />}
      {dimmed && <View style={styles.thumbDimOverlay} />}
    </Pressable>
  );
}

// ─── Cover Carousel ──────────────────────────────────────────────────────────

interface CoverCarouselProps {
  candidates: Photo[];
  activeIndex: number;
  onIndexChange: (n: number) => void;
}

function CoverCarousel({ candidates, activeIndex, onIndexChange }: CoverCarouselProps) {
  const listRef = useRef<FlatList<Photo>>(null);

  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
      onIndexChange(idx);
    },
    [onIndexChange],
  );

  return (
    <View>
      <FlatList
        ref={listRef}
        data={candidates}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        onMomentumScrollEnd={handleScrollEnd}
        getItemLayout={(_, index) => ({
          length: SCREEN_W,
          offset: SCREEN_W * index,
          index,
        })}
        renderItem={({ item }) => (
          <Image
            source={{ uri: item.uri }}
            style={styles.coverImage}
            resizeMode="cover"
          />
        )}
      />
      {/* Dot indicators */}
      <View style={styles.dotsRow}>
        {candidates.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === activeIndex && styles.dotActive]}
          />
        ))}
      </View>
      <Text style={styles.coverHint}>Swipe to pick your cover photo</Text>
    </View>
  );
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────

interface SetupScreenProps {
  onCurate: (opts: CurationOptions) => void;
  isRunning: boolean;
  progress: number;
  progressLabel: string;
}

function SetupScreen({ onCurate, isRunning, progress, progressLabel }: SetupScreenProps) {
  const [startDate, setStartDate] = useState<Date>(daysAgo(7));
  const [endDate, setEndDate] = useState<Date>(endOfToday());
  const [maxCount, setMaxCount] = useState(10);
  const [ratio, setRatio] = useState(0.4); // 40% people, 60% scenery

  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState<'start' | 'end'>('start');
  // Temp date while picker is open (for Android)
  const [tempDate, setTempDate] = useState<Date>(new Date());

  const openPicker = (target: 'start' | 'end') => {
    setDatePickerTarget(target);
    setTempDate(target === 'start' ? startDate : endDate);
    setDatePickerVisible(true);
  };

  const onDateChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setDatePickerVisible(false);
    if (!selected) return;
    if (datePickerTarget === 'start') {
      setStartDate(selected);
    } else {
      const end = new Date(selected);
      end.setHours(23, 59, 59, 999);
      setEndDate(end);
    }
  };

  const setPreset = (days: number) => {
    setStartDate(daysAgo(days));
    setEndDate(endOfToday());
  };

  const handleCurate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onCurate({
      dateRange: { start: startDate, end: endDate },
      maxCount,
      peopleSceneryRatio: ratio,
    });
  };

  const adjustCount = (delta: number) => {
    setMaxCount((c) => Math.min(10, Math.max(1, c + delta)));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const ratioSteps = [0, 0.25, 0.4, 0.6, 0.75, 1];

  return (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={styles.setupContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Text style={styles.appTitle}>Photo Dump</Text>
      <Text style={styles.appSubtitle}>Curate your best shots</Text>

      {/* Date range */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>DATE RANGE</Text>
        <View style={styles.dateRow}>
          <DateField label="From" date={startDate} onPress={() => openPicker('start')} />
          <Text style={styles.dateSeparator}>→</Text>
          <DateField label="To" date={endDate} onPress={() => openPicker('end')} />
        </View>
        <View style={styles.presetsRow}>
          {[
            { label: '7 days', days: 7 },
            { label: '30 days', days: 30 },
            { label: '3 months', days: 90 },
          ].map(({ label, days }) => (
            <TouchableOpacity
              key={label}
              style={styles.presetChip}
              onPress={() => setPreset(days)}
              activeOpacity={0.7}
            >
              <Text style={styles.presetChipText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Photo count */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>PHOTOS TO PICK</Text>
        <View style={styles.countRow}>
          <TouchableOpacity style={styles.countBtn} onPress={() => adjustCount(-1)}>
            <Text style={styles.countBtnText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.countValue}>{maxCount}</Text>
          <TouchableOpacity style={styles.countBtn} onPress={() => adjustCount(1)}>
            <Text style={styles.countBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* People / scenery ratio */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>PEOPLE vs SCENERY</Text>
        <View style={styles.ratioRow}>
          {ratioSteps.map((step) => (
            <TouchableOpacity
              key={step}
              style={[styles.ratioChip, Math.abs(ratio - step) < 0.01 && styles.ratioChipActive]}
              onPress={() => {
                setRatio(step);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Text
                style={[
                  styles.ratioChipText,
                  Math.abs(ratio - step) < 0.01 && styles.ratioChipTextActive,
                ]}
              >
                {step === 0
                  ? 'All scenes'
                  : step === 1
                    ? 'All people'
                    : `${Math.round(step * 100)}% people`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Curate button / progress */}
      {isRunning ? (
        <View style={styles.progressCard}>
          <ProgressBar value={progress} />
          <Text style={styles.progressLabel}>{progressLabel}</Text>
        </View>
      ) : (
        <TouchableOpacity style={styles.curateBtn} onPress={handleCurate} activeOpacity={0.8}>
          <Text style={styles.curateBtnText}>Curate My Dump</Text>
        </TouchableOpacity>
      )}

      {/* Date picker */}
      {datePickerVisible && (
        Platform.OS === 'ios' ? (
          <Modal transparent animationType="slide" onRequestClose={() => setDatePickerVisible(false)}>
            <View style={styles.pickerModalBg}>
              <View style={styles.pickerModalSheet}>
                <View style={styles.pickerModalHeader}>
                  <Text style={styles.pickerModalTitle}>
                    {datePickerTarget === 'start' ? 'Start Date' : 'End Date'}
                  </Text>
                  <TouchableOpacity onPress={() => setDatePickerVisible(false)}>
                    <Text style={styles.pickerDoneBtn}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={tempDate}
                  mode="date"
                  display="spinner"
                  onChange={onDateChange}
                  maximumDate={new Date()}
                  themeVariant="dark"
                  textColor={COLORS.text}
                />
              </View>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            value={tempDate}
            mode="date"
            display="default"
            onChange={onDateChange}
            maximumDate={new Date()}
          />
        )
      )}
    </ScrollView>
  );
}

// ─── Results Screen ───────────────────────────────────────────────────────────

interface ResultsScreenProps {
  result: NonNullable<ReturnType<typeof useCuration>['result']>;
  onCoverIndexChange: (n: number) => void;
  onSwapPhoto: (selectedId: string, replacementId: string) => void;
  onReset: () => void;
}

function ResultsScreen({ result, onCoverIndexChange, onSwapPhoto, onReset }: ResultsScreenProps) {
  const [swapTargetId, setSwapTargetId] = useState<string | null>(null);

  const handleLongPress = (photoId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setSwapTargetId((prev) => (prev === photoId ? null : photoId));
  };

  const handleSwapConfirm = (replacementId: string) => {
    if (!swapTargetId) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSwapPhoto(swapTargetId, replacementId);
    setSwapTargetId(null);
  };

  // Build grid rows: up to 10 photos in groups of 3
  const gridRows: Photo[][] = [];
  for (let i = 0; i < result.selected.length; i += 3) {
    gridRows.push(result.selected.slice(i, i + 3));
  }

  return (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={styles.resultsContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Cover carousel */}
      <CoverCarousel
        candidates={result.coverCandidates}
        activeIndex={result.coverIndex}
        onIndexChange={onCoverIndexChange}
      />

      {/* Palette strip */}
      {result.paletteHues.length > 0 && (
        <View style={styles.paletteRow}>
          {result.paletteHues.slice(0, 6).map((hue, i) => (
            <View
              key={i}
              style={[styles.paletteChip, { backgroundColor: `hsl(${hue}, 55%, 55%)` }]}
            />
          ))}
        </View>
      )}

      {/* Stats row */}
      <View style={styles.statsRow}>
        <Text style={styles.statText}>
          <Text style={styles.statNum}>{result.selected.length}</Text> selected
        </Text>
        <Text style={styles.statSep}>·</Text>
        <Text style={styles.statText}>
          <Text style={styles.statNum}>{result.totalAnalyzed}</Text> analyzed
        </Text>
        <Text style={styles.statSep}>·</Text>
        <Text style={styles.statText}>
          <Text style={styles.statNum}>{result.rejected.length}</Text> rejected
        </Text>
      </View>

      {/* Selected grid */}
      <Text style={styles.gridHeader}>
        {swapTargetId ? 'Long-press again to cancel swap' : 'Long-press a photo to swap it'}
      </Text>
      <View style={styles.grid}>
        {gridRows.map((row, ri) => (
          <View key={ri} style={styles.gridRow}>
            {row.map((photo) => (
              <PhotoThumb
                key={photo.id}
                photo={photo}
                size={GRID_ITEM_SIZE}
                selected={photo.id === swapTargetId}
                onPress={() => swapTargetId === photo.id && setSwapTargetId(null)}
                onLongPress={() => handleLongPress(photo.id)}
              />
            ))}
          </View>
        ))}
      </View>

      {/* Swap row */}
      {swapTargetId && result.rejected.length > 0 && (
        <View style={styles.swapSection}>
          <Text style={styles.swapHeader}>Tap a rejected photo to swap in</Text>
          <FlatList
            horizontal
            data={result.rejected}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.swapList}
            renderItem={({ item }) => (
              <PhotoThumb
                photo={item}
                size={80}
                onPress={() => handleSwapConfirm(item.id)}
              />
            )}
          />
        </View>
      )}

      {/* Reset */}
      <TouchableOpacity style={styles.resetBtn} onPress={onReset} activeOpacity={0.7}>
        <Text style={styles.resetBtnText}>Start Over</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Root screen ─────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { status, progress, progressLabel, result, error, curate, setCoverIndex, swapPhoto } =
    useCuration();

  const isRunning = status === 'requesting' || status === 'fetching' || status === 'scoring';

  const handleReset = () => {
    // Reload by navigating back to idle (no persistent state — just let status drive it)
    // Since useCuration initialises to idle, we need to force a re-render by curation
    // We do this by triggering a no-op through state — simplest: a local reset flag
    // Actually useCuration has no explicit reset; we achieve this by unmounting the results.
    // A lightweight approach: track a local "show setup" override.
    setShowSetup(true);
  };

  const [showSetup, setShowSetup] = useState(false);

  const handleCurate = (opts: CurationOptions) => {
    setShowSetup(false);
    curate(opts);
  };

  const showResults = status === 'done' && result !== null && !showSetup;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {showResults && result ? (
        <ResultsScreen
          result={result}
          onCoverIndexChange={setCoverIndex}
          onSwapPhoto={swapPhoto}
          onReset={handleReset}
        />
      ) : (
        <>
          <SetupScreen
            onCurate={handleCurate}
            isRunning={isRunning}
            progress={progress}
            progressLabel={progressLabel}
          />
          {status === 'error' && error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  fill: {
    flex: 1,
  },

  // Setup
  setupContent: {
    paddingHorizontal: 20,
    paddingTop: 72,
    paddingBottom: 48,
    gap: 16,
  },
  appTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  appSubtitle: {
    fontSize: 15,
    color: COLORS.muted,
    marginTop: 4,
    marginBottom: 8,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    color: COLORS.muted,
  },

  // Dates
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateField: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dateFieldLabel: {
    fontSize: 11,
    color: COLORS.muted,
    marginBottom: 4,
  },
  dateFieldValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  dateSeparator: {
    color: COLORS.muted,
    fontSize: 18,
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  presetChip: {
    backgroundColor: COLORS.bg,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  presetChipText: {
    fontSize: 13,
    color: COLORS.muted,
  },

  // Count
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  countBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBtnText: {
    fontSize: 22,
    color: COLORS.text,
    lineHeight: 26,
  },
  countValue: {
    fontSize: 40,
    fontWeight: '700',
    color: COLORS.accent,
    minWidth: 56,
    textAlign: 'center',
  },

  // Ratio
  ratioRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  ratioChip: {
    backgroundColor: COLORS.bg,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  ratioChipActive: {
    backgroundColor: COLORS.accentDim,
    borderColor: COLORS.accent,
  },
  ratioChipText: {
    fontSize: 13,
    color: COLORS.muted,
  },
  ratioChipTextActive: {
    color: COLORS.text,
    fontWeight: '600',
  },

  // Progress
  progressCard: {
    gap: 10,
    paddingVertical: 8,
  },
  progressTrack: {
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    backgroundColor: COLORS.accent,
    borderRadius: 2,
  },
  progressLabel: {
    fontSize: 13,
    color: COLORS.muted,
    textAlign: 'center',
  },

  // Curate button
  curateBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  curateBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
  },

  // Error banner
  errorBanner: {
    margin: 20,
    backgroundColor: '#2A1414',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 14,
    lineHeight: 20,
  },

  // Date picker modal (iOS)
  pickerModalBg: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  pickerModalSheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  pickerModalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  pickerDoneBtn: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.accent,
  },

  // Results
  resultsContent: {
    paddingBottom: 60,
  },
  coverImage: {
    width: SCREEN_W,
    height: SCREEN_W * 1.25,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.border,
  },
  dotActive: {
    backgroundColor: COLORS.accent,
    width: 18,
  },
  coverHint: {
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 6,
    marginBottom: 16,
  },

  // Palette
  paletteRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  paletteChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  statText: {
    fontSize: 13,
    color: COLORS.muted,
  },
  statNum: {
    color: COLORS.text,
    fontWeight: '600',
  },
  statSep: {
    color: COLORS.border,
  },

  // Grid
  gridHeader: {
    fontSize: 12,
    color: COLORS.muted,
    textAlign: 'center',
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  grid: {
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 8,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 8,
  },
  thumb: {
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbSelectedRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 8,
    borderWidth: 2.5,
    borderColor: COLORS.accent,
  },
  thumbDimOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },

  // Swap
  swapSection: {
    marginTop: 16,
    paddingHorizontal: 16,
    gap: 10,
  },
  swapHeader: {
    fontSize: 12,
    color: COLORS.accent,
    fontWeight: '600',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  swapList: {
    gap: 8,
    paddingVertical: 4,
  },

  // Reset
  resetBtn: {
    margin: 20,
    marginTop: 28,
    borderRadius: 14,
    height: 50,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetBtnText: {
    fontSize: 15,
    color: COLORS.muted,
    fontWeight: '500',
  },
});
