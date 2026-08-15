import asyncio
import signal

from src.config import get_settings
from src.consumer.sqs_consumer import SQSConsumer
from src.graph.build import build_graph
from src.services.container import build_services
from src.utils.logging import configure_logging, get_logger

logger = get_logger()


async def main() -> None:
    configure_logging()
    settings = get_settings()
    services = build_services(settings)
    graph = build_graph(services)
    consumer = SQSConsumer(settings, services, graph)

    loop = asyncio.get_running_loop()

    def _handle_signal(signum) -> None:
        logger.info("received signal", signum=signum)
        consumer.request_shutdown()

    # loop.add_signal_handler isn't implemented on Windows' event loop; plain
    # signal.signal works everywhere (SIGTERM is POSIX-only, which is fine —
    # production runs in Linux containers; SIGINT works cross-platform for
    # local dev).
    try:
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, _handle_signal, sig)
    except NotImplementedError:
        signal.signal(signal.SIGINT, lambda signum, _frame: _handle_signal(signum))
        if hasattr(signal, "SIGTERM"):
            signal.signal(signal.SIGTERM, lambda signum, _frame: _handle_signal(signum))

    await consumer.run()


if __name__ == "__main__":
    asyncio.run(main())
