fn hello() -> &'static str {
    "hello world"
}

fn main() {
    println!("{}", hello());
}

#[cfg(test)]
mod tests {
    use super::hello;

    #[test]
    fn prints_hello_world() {
        assert_eq!(hello(), "hello world");
    }
}
