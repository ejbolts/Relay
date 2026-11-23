import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState, type ComponentRef, type Ref } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  canSendComment,
  clampComment,
  commentLength,
  commentThreads,
  commentTime,
  COMMENT_MAX_LENGTH,
  deleteCommentMessage,
} from '../../../../frontend/src/commentDisplay';
import { REACTIONS, reactionEmoji } from '../../../../frontend/src/friendFeedData';
import type {
  WorkoutComment,
  WorkoutReactionKind,
  WorkoutReactions,
} from '../../../../frontend/src/types';
import { errorMessage } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { useTheme } from '../../ui/theme';
import { Avatar } from './Avatar';
import { socialIcons } from './icons';
import { socialApi } from './socialApi';
import { showReactions, socialKeys, useComments } from './socialQueries';

type Person = WorkoutComment['author'];

/** A workout's comment thread: the comments, and the reply or edit being written. */
export function useCommentThread(workoutId: string, reactions: WorkoutReactions | null) {
  const client = useQueryClient();
  const query = useComments(workoutId);
  const [body, setBody] = useState('');
  const [reply, setReply] = useState<WorkoutComment | null>(null);
  const [editing, setEditing] = useState<WorkoutComment | null>(null);
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const first = query.data?.pages[0];
  const total = first?.total;
  const summary = first?.reactions;
  const summaryKey = summary ? JSON.stringify(summary) : null;

  const latest = useRef(reactions);
  useEffect(() => {
    latest.current = reactions;
  }, [reactions]);
  // The thread's count (and the workout's reactions, from newer servers) shows everywhere, when
  // the server's answer changes.
  useEffect(() => {
    if (total === undefined) return;
    const next = summaryKey ? (JSON.parse(summaryKey) as WorkoutReactions) : latest.current;
    if (next) showReactions(client, workoutId, { ...next, comment_count: total });
  }, [client, workoutId, total, summaryKey]);

  const refresh = () => client.invalidateQueries({ queryKey: socialKeys.comments(workoutId) });
  const send = useMutation({
    mutationFn: () =>
      editing
        ? socialApi.editComment(editing.id, body)
        : socialApi.addComment(workoutId, body, reply?.id ?? null),
    onSuccess: async () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setBody('');
      setReply(null);
      setEditing(null);
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (comment: WorkoutComment) => socialApi.deleteComment(comment.id),
    onSuccess: () => refresh(),
  });
  const reactTo = useMutation({
    mutationFn: ({ comment, kind }: { comment: WorkoutComment; kind: WorkoutReactionKind }) =>
      socialApi.reactToComment(comment.id, comment.reactions.yours === kind ? null : kind),
    onSuccess: () => refresh(),
  });

  return {
    query,
    items,
    body,
    setBody: (value: string) => setBody(clampComment(value)),
    reply,
    editing,
    startReply: (comment: WorkoutComment) => {
      setReply(comment);
      setEditing(null);
    },
    startEdit: (comment: WorkoutComment) => {
      setEditing(comment);
      setBody(comment.body);
      setReply(null);
    },
    cancel: () => {
      setReply(null);
      setEditing(null);
      setBody('');
    },
    send,
    remove,
    reactTo,
    busy: send.isPending || remove.isPending || reactTo.isPending,
    error: send.error ?? remove.error ?? reactTo.error,
  };
}

export type CommentThread = ReturnType<typeof useCommentThread>;

export function CommentList({
  thread,
  onOpenPerson,
  onCompose,
  highlightId,
}: {
  thread: CommentThread;
  onOpenPerson: (person: Person) => void;
  /** After Reply or Edit, to focus the composer. */
  onCompose: () => void;
  /** A comment opened from a notification. */
  highlightId?: string;
}) {
  const { colors, type } = useTheme();
  const [picker, setPicker] = useState<string | null>(null);
  const { query, items } = thread;
  if (query.isPending)
    return <ActivityIndicator accessibilityLabel="Loading comments" color={colors.accentText} />;
  if (query.error && !items.length)
    return (
      <Text accessibilityRole="alert" style={[type.callout, { color: colors.secondary }]}>
        {errorMessage(query.error)}
      </Text>
    );
  if (!items.length)
    return <Text style={[type.callout, { color: colors.secondary }]}>No comments yet.</Text>;

  const comment = (item: WorkoutComment, reply: boolean) => (
    <CommentRow
      key={item.id}
      item={item}
      reply={reply}
      highlighted={item.id === highlightId}
      picking={picker === item.id}
      busy={thread.busy}
      onTogglePicker={() => setPicker(picker === item.id ? null : item.id)}
      onOpenPerson={onOpenPerson}
      onReact={(kind) => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setPicker(null);
        thread.reactTo.mutate({ comment: item, kind });
      }}
      onReply={() => {
        thread.startReply(item);
        onCompose();
      }}
      onEdit={() => {
        thread.startEdit(item);
        onCompose();
      }}
      onDelete={() =>
        Alert.alert('Delete comment?', deleteCommentMessage(items, item), [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => thread.remove.mutate(item) },
        ])
      }
    />
  );
  return (
    <View style={{ gap: 14 }} accessibilityLabel="Workout comments">
      {commentThreads(items).map(({ root, replies }) => (
        <View key={root.id} style={{ gap: 10 }}>
          {comment(root, false)}
          {replies.map((item) => comment(item, true))}
        </View>
      ))}
      {query.hasNextPage && (
        <Pressable
          accessibilityRole="button"
          onPress={() => void query.fetchNextPage()}
          style={styles.more}
        >
          <Text style={[type.callout, { color: colors.accentText, fontWeight: '600' }]}>
            {query.isFetchingNextPage ? 'Loading…' : 'Show more comments'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function CommentRow({
  item,
  reply,
  highlighted,
  picking,
  busy,
  onTogglePicker,
  onOpenPerson,
  onReact,
  onReply,
  onEdit,
  onDelete,
}: {
  item: WorkoutComment;
  reply: boolean;
  highlighted: boolean;
  picking: boolean;
  busy: boolean;
  onTogglePicker: () => void;
  onOpenPerson: (person: Person) => void;
  onReact: (kind: WorkoutReactionKind) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const link = (label: string, onPress: () => void, danger = false) => (
    <Pressable accessibilityRole="button" hitSlop={6} disabled={busy} onPress={onPress}>
      <Text
        style={[
          type.footnote,
          { color: danger ? colors.danger : colors.accentText, fontWeight: '600' },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
  return (
    <View style={[styles.comment, reply && { marginLeft: 40 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.author.display_name}'s profile`}
        onPress={() => onOpenPerson(item.author)}
      >
        <Avatar person={item.author} size={32} />
      </Pressable>
      <View style={{ flex: 1, gap: 6 }}>
        <View
          style={[
            styles.bubble,
            { backgroundColor: colors.surface2, borderRadius: radius.lg },
            highlighted && { backgroundColor: colors.accentSoft, borderColor: colors.accent },
          ]}
        >
          <Text style={[type.footnote, { color: colors.text }]}>
            <Text style={{ fontWeight: '700' }} onPress={() => onOpenPerson(item.author)}>
              {item.author.display_name}
            </Text>
            {item.reaction ? (
              <Text style={{ color: colors.secondary }}>
                {` reacted ${reactionEmoji(item.reaction)}`}
              </Text>
            ) : null}
          </Text>
          <Text style={[type.callout, { color: colors.text }]}>
            {item.reply_to && (
              <Text
                style={{ color: colors.accentText, fontWeight: '600' }}
                onPress={() => onOpenPerson(item.reply_to!)}
              >
                {`@${item.reply_to.display_name} `}
              </Text>
            )}
            {item.body}
          </Text>
        </View>
        <View style={styles.actions}>
          <Text style={[type.caption, { color: colors.muted }]}>
            {commentTime(item.created_at)}
            {item.edited_at ? ' · edited' : ''}
          </Text>
          {link('React', onTogglePicker)}
          {link('Reply', onReply)}
          {item.can_edit && link('Edit', onEdit)}
          {item.can_delete && link('Delete', onDelete, true)}
          {item.reactions.counts.map((count) => (
            <Pressable
              key={count.reaction}
              accessibilityRole="button"
              accessibilityLabel={`${count.reaction}, ${count.count}`}
              accessibilityState={{ selected: item.reactions.yours === count.reaction }}
              disabled={busy}
              onPress={() => onReact(count.reaction)}
              style={[
                styles.chip,
                {
                  borderRadius: radius.pill,
                  backgroundColor:
                    item.reactions.yours === count.reaction ? colors.accentSoft : colors.surface2,
                },
              ]}
            >
              <Text style={[type.caption, { color: colors.text }]}>
                {reactionEmoji(count.reaction)} {count.count}
              </Text>
            </Pressable>
          ))}
        </View>
        {picking && (
          <View
            accessibilityLabel={`React to ${item.author.display_name}'s comment`}
            style={[styles.picker, { backgroundColor: colors.surface2, borderRadius: radius.pill }]}
          >
            {REACTIONS.map((choice) => (
              <Pressable
                key={choice.kind}
                accessibilityRole="button"
                accessibilityLabel={choice.label}
                accessibilityState={{ selected: item.reactions.yours === choice.kind }}
                disabled={busy}
                onPress={() => onReact(choice.kind)}
                style={styles.choice}
              >
                <Text style={{ fontSize: 22 }}>{choice.emoji}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * A workout's comments on their own, titled with its name, for a notification about a workout
 * that is no longer in the loaded feed, as the web shows it.
 */
export function CommentsSheet({
  workoutId,
  title,
  highlightId,
  onClose,
  onOpenPerson,
}: {
  workoutId: string;
  title: string;
  highlightId?: string;
  onClose: () => void;
  onOpenPerson: (person: Person) => void;
}) {
  const thread = useCommentThread(workoutId, null);
  const composer = useRef<ComponentRef<typeof TextInput>>(null);
  return (
    <Sheet visible onClose={onClose} title={title}>
      <CommentList
        thread={thread}
        highlightId={highlightId}
        onOpenPerson={onOpenPerson}
        onCompose={() => composer.current?.focus()}
      />
      <CommentComposer thread={thread} ref={composer} />
    </Sheet>
  );
}

/** Writes a comment, a reply or an edit, up to the server's length. */
export function CommentComposer({
  thread,
  ref: input,
}: {
  thread: CommentThread;
  ref?: Ref<ComponentRef<typeof TextInput>>;
}) {
  const { colors, type, radius } = useTheme();
  const { body, reply, editing, send } = thread;
  const loading = thread.query.isPending;
  return (
    <View style={{ gap: 6 }}>
      {(reply || editing) && (
        <View style={styles.replying}>
          <Text style={[type.footnote, { color: colors.secondary, flex: 1 }]} numberOfLines={1}>
            {editing ? 'Editing comment' : `Replying to @${reply!.author.display_name}`}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel comment reply or edit"
            hitSlop={8}
            onPress={thread.cancel}
          >
            <Icon name="close" size={14} color={colors.secondary} />
          </Pressable>
        </View>
      )}
      <View style={styles.composer}>
        <TextInput
          ref={input}
          accessibilityLabel="Comment"
          placeholder={reply ? 'Write a reply…' : 'Write a comment…'}
          placeholderTextColor={colors.muted}
          value={body}
          onChangeText={thread.setBody}
          editable={!loading && !thread.busy}
          multiline
          style={[
            type.body,
            styles.input,
            { color: colors.text, backgroundColor: colors.surface2, borderRadius: radius.lg },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={editing ? 'Save comment' : 'Send comment'}
          accessibilityState={{ disabled: !canSendComment(body) || thread.busy }}
          disabled={!canSendComment(body) || thread.busy || loading}
          onPress={() => send.mutate()}
          style={({ pressed }) => [
            styles.send,
            (!canSendComment(body) || thread.busy) && { opacity: 0.4 },
            pressed && { opacity: 0.6 },
          ]}
        >
          {send.isPending ? (
            <ActivityIndicator color={colors.accentText} />
          ) : (
            <Icon name={socialIcons.send} size={30} color={colors.accentText} />
          )}
        </Pressable>
      </View>
      <View style={styles.footer}>
        {thread.error ? (
          <Text
            accessibilityRole="alert"
            style={[type.footnote, { color: colors.danger, flex: 1 }]}
          >
            {errorMessage(thread.error)}
          </Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {body.length > 0 && (
          <Text style={[type.caption, type.number, { color: colors.muted }]}>
            {commentLength(body)}/{COMMENT_MAX_LENGTH}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  comment: { flexDirection: 'row', gap: 8 },
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 8, paddingVertical: 3 },
  picker: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  choice: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  more: { alignItems: 'center', paddingVertical: 10 },
  replying: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, maxHeight: 120, minHeight: 42, paddingHorizontal: 14, paddingVertical: 10 },
  send: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 16 },
});
