"""Simple script that adds two numbers."""


def add_two_numbers(a: float, b: float) -> float:
    """Return the sum of two numbers."""
    return a + b


if __name__ == "__main__":
    num1 = 5
    num2 = 7
    print(f"{num1} + {num2} = {add_two_numbers(num1, num2)}")