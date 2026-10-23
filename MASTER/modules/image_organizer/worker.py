from PySide6.QtCore import QThread, Signal
from core.processor import Processor


class ProcessorWorker(QThread):

    log_signal    = Signal(str)
    progress_signal = Signal(int)
    done_signal   = Signal(int, int)   # copied, skipped

    def __init__(self, project):
        super().__init__()
        self.project = project
        self._processor = None

    def run(self):
        self._processor = Processor(
            self.project,
            logger=self,
            progress_callback=self.progress_signal.emit,
            done_callback=self.done_signal.emit,
        )
        self._processor.run()

    def cancel(self):
        if self._processor:
            self._processor.cancel()

    # LogPanel-compatible write()
    def write(self, text):
        self.log_signal.emit(text)
