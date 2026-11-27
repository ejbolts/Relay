import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ComponentRef, type Ref } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import {
  canSendComment,
  clampComment,
  commentLength,
  commentThreads,
  commentTime,
  COMMENT_MAX_LENGTH,
  deleteCommentMessage,
  moreRepliesLabel,
  threadRoot,
  visibleReplies,
} from '../../../../frontend/src/commentDisplay';
import { reactionChoice, reactionEmoji } from '../../../../frontend/src/friendFeedData';
import type {
  WorkoutComment,
  WorkoutReactionKind,
  WorkoutReactions,
} from '../../../../frontend/src/types';
import { Button, errorMessage } from '../../ui/components';
import { OFFLINE_MESSAGE, waitingForNetwork } from '../../data/offline';
import { ContextMenu } from '../../ui/ContextMenu';
import { haptics } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import type { MenuItem } from '../../ui/MenuButton';
import { Sheet } from '../../ui/Sheet';
import { useTheme } from '../../ui/theme';
import { Avatar } from './Avatar';
import { EmojiReactionSheet } from './EmojiReactionSheet';
import { useScrollToComment } from './scrollToComment';
import { socialIcons } from './icons';
import { socialApi } from './socialApi';
import { showReactions, socialKeys, useComments } from './socialQueries';

type Person = WorkoutComment['author'];

/** What Send posts, fixed when it is pressed, so a reply waiting offline keeps its comment. */
interface SendComment {
  workoutId: string;
  body: string;
  replyId: string | null;
  editId: string | null;
}

/** One key for every write to a workout's thread, so any of them reads as busy. */
const commentWrites = (workoutId: string) => ['comment-write', workoutId] as const;

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
  const mutationKey = commentWrites(workoutId);
  // Read when an action runs rather than when its menu was drawn: a menu opened before a send
  // started (or paused offline) must not change the reply that send is waiting to post.
  const writing = () => client.isMutating({ mutationKey }) > 0;
  const send = useMutation({
    mutationKey,
    mutationFn: (next: SendComment) =>
      next.editId
        ? socialApi.editComment(next.editId, next.body)
        : socialApi.addComment(next.workoutId, next.body, next.replyId),
    // On failure the draft, and the reply or edit it belongs to, stay as they were.
    onSuccess: async () => {
      haptics.success();
      setBody('');
      setReply(null);
      setEditing(null);
      await refresh();
    },
  });
  const remove = useMutation({
    mutationKey,
    mutationFn: (comment: WorkoutComment) => socialApi.deleteComment(comment.id),
    onSuccess: () => refresh(),
  });
  const reactTo = useMutation({
    mutationKey,
    mutationFn: ({
      comment,
      reaction,
    }: {
      comment: WorkoutComment;
      reaction: WorkoutReactionKind | null;
    }) => socialApi.reactToComment(comment.id, reaction),
    onSuccess: () => refresh(),
  });

  return {
    query,
    items,
    body,
    setBody: (value: string) => setBody(clampComment(value)),
    reply,
    editing,
    /** Returns whether the reply started; nothing changes while a write is under way. */
    startReply: (comment: WorkoutComment) => {
      if (writing()) return false;
      setReply(comment);
      setEditing(null);
      return true;
    },
    startEdit: (comment: WorkoutComment) => {
      if (writing() || !comment.can_edit) return false;
      setEditing(comment);
      setBody(comment.body);
      setReply(null);
      return true;
    },
    cancel: () => {
      if (writing()) return;
      setReply(null);
      setEditing(null);
      setBody('');
    },
    submit: () => {
      if (writing() || !canSendComment(body)) return;
      send.mutate({
        workoutId,
        body,
        replyId: editing ? null : (reply?.id ?? null),
        editId: editing?.id ?? null,
      });
    },
    deleteComment: (comment: WorkoutComment) => {
      if (writing() || !comment.can_delete) return;
      remove.mutate(comment);
    },
    /** Reacts to a comment, or removes your reaction when `reaction` is null. */
    react: (comment: WorkoutComment, reaction: WorkoutReactionKind | null) => {
      if (writing()) return;
      reactTo.mutate({ comment, reaction });
    },
    writing,
    send,
    remove,
    reactTo,
    busy: send.isPending || remove.isPending || reactTo.isPending,
    error: send.error ?? remove.error ?? reactTo.error,
  };
}

export type CommentThread = ReturnType<typeof useCommentThread>;

/** What a screen reader says for a comment: who, any reaction, who it answers, and its text. */
export function commentSpoken(item: WorkoutComment) {
  const reaction = item.reaction
    ? `, reacted ${reactionChoice(item.reaction)?.label ?? item.reaction}`
    : '';
  const to = item.reply_to ? `, replying to ${item.reply_to.display_name}` : '';
  return `${item.author.display_name}${reaction}${to}: ${item.body}`;
}

export function CommentList({
  thread,
  onOpenPerson,
  onCompose,
  highlightId,
  onTarget,
}: {
  thread: CommentThread;
  onOpenPerson: (person: Person) => void;
  /** After Reply or Edit, to focus the composer. */
  onCompose: () => void;
  /** A comment opened from a notification. */
  highlightId?: string;
  /**
   * Where the highlighted comment sits, in points from the top of this list, once it is loaded
   * and laid out; `null` when every page is loaded and it isn't there (deleted, say).
   */
  onTarget?: (y: number | null) => void;
}) {
  const { colors, type } = useTheme();
  const [picker, setPicker] = useState<string | null>(null);
  // Threads showing every reply, rather than the first two, as on the web.
  const [openThreads, setOpenThreads] = useState<string[]>([]);
  const openThread = (id: string) =>
    setOpenThreads((current) => (current.includes(id) ? current : [...current, id]));
  const { query, items } = thread;
  const found = !!highlightId && items.some((item) => item.id === highlightId);
  const { hasNextPage, isFetchingNextPage, isPending, fetchNextPage } = query;
  // A notification's comment can be past the first page: load pages until it appears.
  useEffect(() => {
    if (!highlightId || isPending || found || isFetchingNextPage) return;
    if (hasNextPage) void fetchNextPage();
    else onTarget?.(null);
  }, [highlightId, isPending, found, hasNextPage, isFetchingNextPage, fetchNextPage, onTarget]);
  // The target's thread group and its row report their offsets; together they place the row.
  const target = useRef<{ group?: number; row?: number }>({});
  const placeTarget = (part: 'group' | 'row', y: number) => {
    target.current[part] = y;
    const { group, row } = target.current;
    if (group !== undefined && row !== undefined) onTarget?.(group + row);
  };
  if (waitingForNetwork(query))
    return (
      <Text accessibilityRole="alert" style={[type.callout, { color: colors.secondary }]}>
        {OFFLINE_MESSAGE}
      </Text>
    );
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
      onLayout={
        item.id === highlightId
          ? (event) => placeTarget('row', event.nativeEvent.layout.y)
          : undefined
      }
      picking={picker === item.id}
      busy={thread.busy}
      onOpenPerson={onOpenPerson}
      onReact={(reaction) => {
        haptics.tap();
        setPicker(null);
        thread.react(item, reaction);
      }}
      onTogglePicker={() => {
        if (thread.writing()) return;
        setPicker((current) => (current === item.id ? null : item.id));
      }}
      onClosePicker={() => setPicker(null)}
      onReply={() => {
        if (!thread.startReply(item)) return;
        // Replying opens the whole thread, so your reply shows once it is sent.
        openThread(threadRoot(item));
        onCompose();
      }}
      onEdit={() => {
        if (thread.startEdit(item)) onCompose();
      }}
      onDelete={() => {
        if (thread.writing() || !item.can_delete) return;
        Alert.alert('Delete comment?', deleteCommentMessage(items, item), [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => thread.deleteComment(item) },
        ]);
      }}
    />
  );
  return (
    <View style={{ gap: 14 }} accessibilityLabel="Workout comments">
      {commentThreads(items).map(({ root, replies }) => {
        const { shown, hidden } = visibleReplies(
          replies,
          openThreads.includes(root.id),
          highlightId,
        );
        return (
          <View
            key={root.id}
            testID={`comment-thread-${root.id}`}
            style={{ gap: 10 }}
            onLayout={
              highlightId && (root.id === highlightId || replies.some((r) => r.id === highlightId))
                ? (event) => placeTarget('group', event.nativeEvent.layout.y)
                : undefined
            }
          >
            {comment(root, false)}
            {shown.map((item) => comment(item, true))}
            {hidden > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Show ${hidden} more ${hidden === 1 ? 'reply' : 'replies'} to ${root.author.display_name}'s comment`}
                hitSlop={8}
                onPress={() => {
                  haptics.selection();
                  openThread(root.id);
                }}
                style={({ pressed }) => [styles.moreReplies, pressed && { opacity: 0.6 }]}
              >
                <Text style={[type.footnote, { color: colors.accentText, fontWeight: '600' }]}>
                  {moreRepliesLabel(hidden)}
                </Text>
              </Pressable>
            )}
          </View>
        );
      })}
      {query.hasNextPage && (
        <Button
          label={query.isFetchingNextPage ? 'Loading…' : 'Show more comments'}
          variant="secondary"
          size="small"
          loading={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
        />
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
  onClosePicker,
  onOpenPerson,
  onReact,
  onReply,
  onEdit,
  onDelete,
  onLayout,
}: {
  item: WorkoutComment;
  reply: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
  highlighted: boolean;
  picking: boolean;
  busy: boolean;
  onTogglePicker: () => void;
  onClosePicker: () => void;
  onOpenPerson: (person: Person) => void;
  /** Saves a reaction, or removes yours when null. */
  onReact: (reaction: WorkoutReactionKind | null) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const replyTo = item.reply_to;
  const menuItems: MenuItem[] = [
    { label: 'React', onPress: onTogglePicker },
    { label: 'Reply', onPress: onReply },
    ...(item.can_edit ? [{ label: 'Edit', onPress: onEdit }] : []),
    ...(item.can_delete ? [{ label: 'Delete', destructive: true, onPress: onDelete }] : []),
    // The @mention is a link inside the bubble, which a screen reader reads as one element.
    ...(replyTo
      ? [{ label: `Open ${replyTo.display_name}'s profile`, onPress: () => onOpenPerson(replyTo) }]
      : []),
  ];
  const link = (label: string, onPress: () => void, danger = false) => (
    <Pressable
      accessibilityRole="button"
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      disabled={busy}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      style={({ pressed }) => [styles.actionLink, pressed && { opacity: 0.6 }]}
    >
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
    <View
      testID={`comment-${item.id}`}
      style={[styles.comment, reply && { marginLeft: 40 }]}
      onLayout={onLayout}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.author.display_name}'s profile`}
        hitSlop={6}
        onPress={() => onOpenPerson(item.author)}
      >
        <Avatar person={item.author} size={32} />
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        <ContextMenu
          items={menuItems}
          title={item.author.display_name}
          accessibilityLabel={commentSpoken(item)}
        >
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
        </ContextMenu>
        <View style={styles.actions}>
          <Text style={[type.caption, { color: colors.muted }]}>
            {commentTime(item.created_at)}
            {item.edited_at ? ' · edited' : ''}
          </Text>
          {link('React', onTogglePicker)}
          {link('Reply', onReply)}
          {item.can_edit && link('Edit', onEdit)}
          {item.can_delete && link('Delete', onDelete, true)}
          {item.reactions.counts.map((count) => {
            const mine = item.reactions.yours === count.reaction;
            return (
              <Pressable
                key={count.reaction}
                accessibilityRole="button"
                accessibilityLabel={`${reactionChoice(count.reaction)?.label ?? count.reaction}, ${count.count}`}
                accessibilityState={{ selected: mine }}
                hitSlop={8}
                disabled={busy}
                onPress={() => onReact(mine ? null : count.reaction)}
                style={[
                  styles.chip,
                  {
                    borderRadius: radius.pill,
                    borderColor: mine ? colors.accent : colors.lineStrong,
                    backgroundColor: mine ? colors.accentSoft : colors.surface2,
                  },
                ]}
              >
                <Text style={[type.caption, { color: colors.text, fontWeight: '600' }]}>
                  {reactionEmoji(count.reaction)} {count.count}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {picking && (
          <EmojiReactionSheet
            title={`React to ${item.author.display_name}'s comment`}
            yours={item.reactions.yours}
            busy={busy}
            onChoose={onReact}
            onClose={onClosePicker}
          />
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
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const { height } = useWindowDimensions();
  const toComment = useScrollToComment({ enabled: !!highlightId, commentId: highlightId, scroll });
  return (
    <Sheet visible onClose={onClose} title={title}>
      {/* The thread scrolls on its own above the composer, so a notification's comment can be
          scrolled to and Send stays in view. */}
      <ScrollView
        ref={scroll}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        style={{ maxHeight: Math.round(height * 0.55) }}
      >
        <View testID="comments-box" onLayout={toComment.onBox}>
          <View testID="comments-list" onLayout={toComment.onList}>
            <CommentList
              thread={thread}
              highlightId={highlightId}
              onTarget={toComment.onTarget}
              onOpenPerson={onOpenPerson}
              onCompose={() => composer.current?.focus()}
            />
          </View>
        </View>
      </ScrollView>
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
  const { colors, scheme, type, radius } = useTheme();
  const [focused, setFocused] = useState(false);
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
            accessibilityState={{ disabled: thread.busy }}
            disabled={thread.busy}
            hitSlop={12}
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
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          keyboardAppearance={scheme}
          value={body}
          onChangeText={thread.setBody}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          editable={!loading && !thread.busy}
          multiline
          style={[
            type.body,
            styles.input,
            {
              color: colors.text,
              backgroundColor: colors.surface2,
              borderColor: focused ? colors.accent : colors.lineStrong,
              borderRadius: radius.md,
            },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={editing ? 'Save comment' : 'Send comment'}
          accessibilityState={{ disabled: !canSendComment(body) || thread.busy }}
          disabled={!canSendComment(body) || thread.busy || loading}
          onPress={() => {
            haptics.tap();
            thread.submit();
          }}
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
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  // Lines up with the replies' avatars, which sit one indent in.
  moreReplies: { minHeight: 32, justifyContent: 'center', alignSelf: 'flex-start', marginLeft: 40 },
  actionLink: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 4 },
  chip: { paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  replying: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  send: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 16 },
});
