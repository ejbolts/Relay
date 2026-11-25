import { useEffect, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './theme';

// Native menus and text prompts. iOS uses its own action sheet and alert prompt; Android, which
// has neither, shows a bottom sheet or dialog drawn by the most recently mounted <PromptHost />.

export interface MenuOption {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

interface MenuRequest {
  kind: 'menu';
  title?: string;
  options: MenuOption[];
}

interface TextRequest {
  kind: 'text';
  title: string;
  value: string;
  placeholder?: string;
  submitLabel: string;
  multiline?: boolean;
  onSubmit: (value: string) => void;
}

type Request = MenuRequest | TextRequest;
type Host = (request: Request | null) => void;
const hosts: Host[] = [];
/** iOS's own action sheet or text prompt is up (they answer through a callback). */
let nativeShowing = false;
/** The prompt hosts whose menu sheet or text dialog is up (several hosts can be mounted). */
const showingHosts = new Set<Host>();

/** A menu or text prompt is on screen, so the logger's tips wait for it, as the web's do. */
export function promptShowing() {
  return nativeShowing || showingHosts.size > 0;
}

/** A list of actions, with Cancel. */
export function showMenu(title: string | undefined, options: MenuOption[]) {
  if (Platform.OS === 'ios') {
    const destructive = options.flatMap((option, index) => (option.destructive ? [index] : []));
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...options.map((option) => option.label), 'Cancel'],
        cancelButtonIndex: options.length,
        destructiveButtonIndex: destructive,
      },
      (index) => {
        nativeShowing = false;
        options[index]?.onPress();
      },
    );
    nativeShowing = true;
    return;
  }
  hosts.at(-1)?.({ kind: 'menu', title, options });
}

/** Asks for a line (or a note) of text. */
export function promptText(request: Omit<TextRequest, 'kind'>) {
  if (Platform.OS === 'ios' && !request.multiline) {
    Alert.prompt(
      request.title,
      undefined,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            nativeShowing = false;
          },
        },
        {
          text: request.submitLabel,
          onPress: (value?: string) => {
            nativeShowing = false;
            request.onSubmit(value ?? '');
          },
        },
      ],
      'plain-text',
      request.value,
    );
    nativeShowing = true;
    return;
  }
  hosts.at(-1)?.({ kind: 'text', ...request });
}

export function PromptHost() {
  const [request, setRequest] = useState<Request | null>(null);
  useEffect(() => {
    const host: Host = setRequest;
    hosts.push(host);
    return () => {
      hosts.splice(hosts.indexOf(host), 1);
    };
  }, []);
  useEffect(() => {
    if (request) showingHosts.add(setRequest);
    else showingHosts.delete(setRequest);
    return () => {
      showingHosts.delete(setRequest);
    };
  }, [request]);
  const close = () => setRequest(null);
  return (
    <Modal
      visible={!!request}
      transparent
      animationType={request?.kind === 'menu' ? 'slide' : 'fade'}
      onRequestClose={close}
      statusBarTranslucent
      navigationBarTranslucent
    >
      {request?.kind === 'menu' && <MenuSheet request={request} onClose={close} />}
      {request?.kind === 'text' && <TextDialog request={request} onClose={close} />}
    </Modal>
  );
}

function MenuSheet({ request, onClose }: { request: MenuRequest; onClose: () => void }) {
  const { colors, type } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.backdrop}>
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel="Cancel"
        onPress={onClose}
      />
      <View
        style={[
          styles.sheet,
          // Bounded, so a long data-driven menu scrolls instead of running off the screen.
          { backgroundColor: colors.surface, paddingBottom: insets.bottom + 8, maxHeight: '85%' },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: colors.lineStrong }]} />
        {!!request.title && (
          <Text style={[type.footnote, styles.menuTitle, { color: colors.muted }]}>
            {request.title}
          </Text>
        )}
        <ScrollView
          style={styles.menuOptions}
          accessibilityLabel={request.title}
          bounces={false}
          showsVerticalScrollIndicator
        >
          {request.options.map((option) => (
            <Pressable
              key={option.label}
              accessibilityRole="button"
              onPress={() => {
                onClose();
                option.onPress();
              }}
              style={({ pressed }) => [
                styles.menuRow,
                pressed && { backgroundColor: colors.surface2 },
              ]}
            >
              <Text
                style={[type.body, { color: option.destructive ? colors.danger : colors.text }]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function TextDialog({ request, onClose }: { request: TextRequest; onClose: () => void }) {
  const { colors, type, radius } = useTheme();
  const [value, setValue] = useState(request.value);
  const submit = () => {
    onClose();
    request.onSubmit(value);
  };
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.backdrop, { justifyContent: 'center', padding: 24 }]}
    >
      <View style={[styles.dialog, { backgroundColor: colors.surface, borderRadius: radius.card }]}>
        <Text accessibilityRole="header" style={[type.headline, { color: colors.text }]}>
          {request.title}
        </Text>
        <TextInput
          autoFocus
          selectTextOnFocus
          value={value}
          onChangeText={setValue}
          placeholder={request.placeholder}
          placeholderTextColor={colors.muted}
          multiline={request.multiline}
          accessibilityLabel={request.title}
          returnKeyType={request.multiline ? 'default' : 'done'}
          onSubmitEditing={request.multiline ? undefined : submit}
          style={[
            type.body,
            styles.input,
            request.multiline && { minHeight: 96, textAlignVertical: 'top' },
            {
              color: colors.text,
              backgroundColor: colors.surface2,
              borderRadius: radius.md,
            },
          ]}
        />
        <View style={styles.dialogActions}>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.dialogButton}>
            <Text style={[type.callout, { color: colors.accentText, fontWeight: '600' }]}>
              Cancel
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={submit} style={styles.dialogButton}>
            <Text style={[type.callout, { color: colors.accentText, fontWeight: '700' }]}>
              {request.submitLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8 },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    marginBottom: 8,
  },
  menuTitle: { paddingHorizontal: 20, paddingVertical: 8 },
  menuOptions: { flexGrow: 0, flexShrink: 1 },
  menuRow: { paddingHorizontal: 20, paddingVertical: 15 },
  dialog: { padding: 20, gap: 14 },
  input: { paddingHorizontal: 12, paddingVertical: 10 },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  dialogButton: { paddingHorizontal: 12, paddingVertical: 8 },
});
