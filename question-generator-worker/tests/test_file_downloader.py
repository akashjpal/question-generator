import io

import pytest
from botocore.exceptions import ClientError

import helpers.file_downloader as fd


class FakeBody:
    def __init__(self, data: bytes):
        self._stream = io.BytesIO(data)

    def read(self):
        return self._stream.read()


class FakeS3:
    def __init__(self, objects: dict):
        self.objects = objects
        self.calls = []

    def get_object(self, Bucket, Key):
        self.calls.append((Bucket, Key))
        if (Bucket, Key) not in self.objects:
            raise ClientError(
                {"Error": {"Code": "NoSuchKey", "Message": "not found"}},
                "GetObject",
            )
        return {"Body": FakeBody(self.objects[(Bucket, Key)])}


def test_download_file_reads_bytes_from_correct_files_bucket(monkeypatch):
    fake = FakeS3({("correct-files", "abc-file.pdf"): b"%PDF-bytes"})
    monkeypatch.setattr(fd, "s3", fake)
    monkeypatch.setattr(fd, "get_correct_bucket", lambda: "correct-files")

    result = fd.download_file("abc-file.pdf")

    assert result == b"%PDF-bytes"
    assert fake.calls == [("correct-files", "abc-file.pdf")]


def test_download_file_raises_file_not_found_when_key_missing(monkeypatch):
    fake = FakeS3({})
    monkeypatch.setattr(fd, "s3", fake)
    monkeypatch.setattr(fd, "get_correct_bucket", lambda: "correct-files")

    with pytest.raises(FileNotFoundError):
        fd.download_file("missing.pdf")
