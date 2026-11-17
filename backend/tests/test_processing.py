from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest
from conftest import make_user

from app.config import Settings, get_settings
from app.database import SessionLocal
from app.models import (
    Clip,
    ClipUploadStatus,
    Exercise,
    ExerciseKind,
    SessionStatus,
    Timestamp,
    TrainingWorkout,
    WorkoutCategory,
    WorkoutMovement,
    WorkoutSession,
    WorkoutSet,
)
from app.processing import (
    ProcessingError,
    SessionProcessor,
    link_session_videos_to_workout,
    make_timestamps,
)
from app.youtube import GoogleYouTubeUploader, MockYouTubeUploader, YouTubeUploadError


def make_clip(order: int, duration: int, label: str | None) -> Clip:
    return Clip(
        id=f"clip-{order}",
        client_clip_id=f"client-{order}",
        session_id="session",
        original_filename="set.mp4",
        stored_filename="stored.mp4",
        order_index=order,
        exercise_label=label,
        file_size=1,
        upload_status=ClipUploadStatus.UPLOADED,
        duration_ms=duration,
    )


def test_timestamp_calculation_and_set_numbering():
    timestamps = make_timestamps(
        [
            make_clip(0, 12_500, "Back squat"),
            make_clip(1, 10_000, " back  squat "),
            make_clip(2, 1_000, None),
        ]
    )
    assert [(item.start_seconds, item.label) for item in timestamps] == [
        (0, "Back squat - Set 1"),
        (12, "back squat - Set 2"),
        (22, "Set N"),
    ]


def test_completed_video_timestamp_is_added_to_matching_exercise_notes():
    with SessionLocal() as db:
        exercise = Exercise(
            name="Back Squat",
            category=WorkoutCategory.LOWER,
            kind=ExerciseKind.STRENGTH,
            muscle_group="Quads",
        )
        workout = TrainingWorkout(
            name="Lower body",
            workout_date=date(2026, 7, 12),
            category=WorkoutCategory.LOWER,
        )
        movement = WorkoutMovement(exercise=exercise, order_index=0, notes="Keep the chest tall.")
        movement.sets.append(WorkoutSet(order_index=0, reps=5, weight_kg=100, completed=True))
        workout.movements.append(movement)
        session = WorkoutSession(
            name="Lower body",
            workout_date=date(2026, 7, 12),
            expected_clip_count=1,
            uploaded_clip_count=1,
            status=SessionStatus.COMPLETE,
            youtube_video_id="youtube-video",
            youtube_url="https://youtu.be/youtube-video",
        )
        clip = Clip(
            client_clip_id="client-1",
            original_filename="squat.mov",
            stored_filename="stored.mov",
            order_index=0,
            exercise_label="Back squat",
            file_size=1,
            upload_status=ClipUploadStatus.UPLOADED,
            duration_ms=12_000,
        )
        session.clips.append(clip)
        session.timestamps.append(
            Timestamp(
                clip=clip,
                order_index=0,
                label="Back squat - Set 1",
                start_seconds=0,
                youtube_url="https://youtu.be/youtube-video?t=0",
            )
        )
        db.add_all([workout, session])
        db.commit()

        assert link_session_videos_to_workout(db, session) == 1
        assert link_session_videos_to_workout(db, session) == 0
        db.commit()
        db.refresh(movement)

        assert movement.notes == (
            "Keep the chest tall.\n"
            "Video - Back squat - Set 1 @ 0:00: https://youtu.be/youtube-video?t=0"
        )


def test_mock_youtube_uploader_returns_a_deterministic_link(tmp_path: Path):
    video = tmp_path / "combined.mp4"
    video.write_bytes(b"test")
    result = MockYouTubeUploader().upload(video, "title", "description")
    assert result.video_id.startswith("mock-")
    assert result.url == f"https://youtu.be/{result.video_id}"


@pytest.mark.parametrize(
    "override, expected", [(None, "unlisted"), ("private", "private"), ("public", "public")]
)
def test_youtube_uploads_are_unlisted_by_default_and_honor_explicit_overrides(
    tmp_path, monkeypatch, override, expected
):
    from unittest.mock import Mock

    monkeypatch.delenv("GYM_YOUTUBE_PRIVACY_STATUS", raising=False)
    settings = Settings(
        _env_file=None,
        data_dir=tmp_path,
        database_path=tmp_path / "sample.db",
        **({"youtube_privacy_status": override} if override else {}),
    )
    uploader = GoogleYouTubeUploader(settings)
    youtube = Mock()
    youtube.videos.return_value.insert.return_value.next_chunk.return_value = (
        None,
        {"id": "sample-video"},
    )
    monkeypatch.setattr(uploader, "_youtube_client", lambda: youtube)
    video = tmp_path / "sample.mp4"
    video.write_bytes(b"synthetic video bytes")
    uploader.upload(video, "Sample workout", "")
    assert (
        youtube.videos.return_value.insert.call_args.kwargs["body"]["status"]["privacyStatus"]
        == expected
    )


def test_ffmpeg_failure_marks_session_failed(monkeypatch, tmp_path: Path):
    settings = get_settings()
    original = tmp_path / "original.mp4"
    original.write_bytes(b"original")
    with SessionLocal() as db:
        session = WorkoutSession(
            name="Test",
            workout_date=date(2026, 7, 12),
            expected_clip_count=1,
            uploaded_clip_count=1,
            status=SessionStatus.QUEUED,
        )
        db.add(session)
        db.flush()
        db.add(
            Clip(
                client_clip_id="client",
                session_id=session.id,
                original_filename="original.mp4",
                stored_filename="server.mp4",
                order_index=0,
                file_size=1,
                upload_status=ClipUploadStatus.UPLOADED,
                duration_ms=1_000,
                original_path=str(original),
            )
        )
        db.commit()
        session_id = session.id
    processor = SessionProcessor(SessionLocal, settings, MockYouTubeUploader())
    monkeypatch.setattr(
        processor,
        "_normalize",
        lambda *_, **__: (_ for _ in ()).throw(ProcessingError("ffmpeg boom")),
    )
    processor.process(session_id)
    with SessionLocal() as db:
        failed = db.get(WorkoutSession, session_id)
        assert failed and failed.status == SessionStatus.FAILED
        assert "ffmpeg boom" in (failed.processing_error or "")


def test_successful_youtube_processing_removes_local_video_files(tmp_path: Path):
    settings = get_settings()
    assert settings.delete_originals_after_success is True
    assert settings.delete_output_after_success is True
    original = tmp_path / "original.mp4"
    original.write_bytes(b"keep me")
    output = settings.output_dir / "session.mp4"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(b"stitched")
    clip = make_clip(0, 1_000, None)
    clip.original_path = str(original)
    SessionProcessor(SessionLocal, settings)._cleanup_after_youtube_success("session", [clip])
    assert not original.exists()
    assert not output.exists()


def test_description_template_decodes_env_newline_escapes(tmp_path: Path):
    settings = Settings(
        data_dir=tmp_path,
        database_path=tmp_path / "test.db",
        youtube_description_template="{notes}\\n\\n{chapters}",
    )
    assert settings.youtube_description_template.format(notes="Notes", chapters="Chapters") == (
        "Notes\n\nChapters"
    )


def test_normalization_uses_a_fixed_canvas_without_stretching(tmp_path: Path):
    settings = get_settings()
    processor = SessionProcessor(SessionLocal, settings, MockYouTubeUploader())
    command: list[str] = []
    processor._run_ffmpeg = lambda args, _: command.extend(args)  # type: ignore[method-assign]

    processor._normalize(
        tmp_path / "portrait.mov", tmp_path / "normalized.mp4", source_duration_ms=30_000
    )

    video_filter = command[command.index("-vf") + 1]
    assert "scale=1920:1080:force_original_aspect_ratio=decrease" in video_filter
    assert "pad=1920:1080:(ow-iw)/2:(oh-ih)/2" in video_filter
    assert "fps=30" in video_filter
    assert command[command.index("-ss") + 1] == "5.000"
    assert command[command.index("-t") + 1] == "20.000"


def test_trim_window_preserves_at_least_three_seconds_for_short_clips():
    processor = SessionProcessor(SessionLocal, get_settings(), MockYouTubeUploader())
    assert processor._trim_window(10_000) == (3.5, 3.0)
    assert processor._trim_window(3_000) is None


def test_youtube_processing_completion_sends_a_phone_notification(monkeypatch):
    class ProcessingUploader:
        is_mock = False

        def upload(self, *_):
            raise AssertionError("not used in this test")

        def processing_status(self, video_id: str) -> str:
            assert video_id == "youtube-video"
            return "succeeded"

    settings = get_settings()
    owner_id = make_user()
    with SessionLocal() as db:
        session = WorkoutSession(
            user_id=owner_id,
            name="Push day",
            workout_date=date(2026, 7, 12),
            expected_clip_count=1,
            uploaded_clip_count=1,
            status=SessionStatus.YOUTUBE_PROCESSING,
            youtube_video_id="youtube-video",
            youtube_url="https://youtu.be/youtube-video",
        )
        db.add(session)
        db.commit()
        session_id = session.id

    notifications: list[dict[str, str]] = []
    monkeypatch.setattr(
        "app.processing.send_push_notification",
        lambda *_, **payload: notifications.append(payload),
    )
    processor = SessionProcessor(SessionLocal, settings, ProcessingUploader())
    processor.check_youtube_processing(session_id)

    with SessionLocal() as db:
        completed = db.get(WorkoutSession, session_id)
        assert completed and completed.status == SessionStatus.COMPLETE
    assert notifications == [
        {
            "title": "Workout video ready",
            "body": "Push day is ready on YouTube.",
            "user_id": owner_id,
        }
    ]


def test_missing_youtube_processing_scope_becomes_actionable_failure(monkeypatch):
    class InsufficientScopeUploader:
        is_mock = False

        def upload(self, *_):
            raise AssertionError("not used in this test")

        def processing_status(self, video_id: str) -> str:
            raise YouTubeUploadError("<HttpError 403: insufficient authentication scopes>")

    settings = get_settings()
    with SessionLocal() as db:
        session = WorkoutSession(
            name="OAuth check",
            workout_date=date(2026, 7, 12),
            expected_clip_count=1,
            uploaded_clip_count=1,
            status=SessionStatus.YOUTUBE_PROCESSING,
            youtube_video_id="youtube-video",
        )
        db.add(session)
        db.commit()
        session_id = session.id

    monkeypatch.setattr("app.processing.send_push_notification", lambda *_, **__: None)
    processor = SessionProcessor(SessionLocal, settings, InsufficientScopeUploader())
    processor.check_youtube_processing(session_id)

    with SessionLocal() as db:
        failed = db.get(WorkoutSession, session_id)
        assert failed and failed.status == SessionStatus.FAILED
        assert "Reconnect your channel in Video logger" in (failed.processing_error or "")
