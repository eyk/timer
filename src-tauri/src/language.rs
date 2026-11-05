pub fn select(languages: &str) -> &'static str {
    for language in languages.split('\0') {
        let base = language.split('-').next().unwrap_or("");
        if base.eq_ignore_ascii_case("de") {
            return "de";
        }
        if base.eq_ignore_ascii_case("en") {
            return "en";
        }
    }
    "en"
}
pub fn current() -> &'static str {
    #[cfg(debug_assertions)]
    if let Ok(value) = std::env::var("TIMER_LANGUAGE") {
        if value == "de" {
            return "de";
        }
        if value == "en" {
            return "en";
        }
    }
    static LANGUAGE: std::sync::OnceLock<&'static str> = std::sync::OnceLock::new();
    LANGUAGE.get_or_init(|| {
        #[cfg(windows)]
        unsafe {
            use windows_sys::Win32::Globalization::{
                GetUserPreferredUILanguages, MUI_LANGUAGE_NAME,
            };
            let mut count = 0;
            let mut size = 0;
            GetUserPreferredUILanguages(
                MUI_LANGUAGE_NAME,
                &mut count,
                std::ptr::null_mut(),
                &mut size,
            );
            let mut buffer = vec![0u16; size as usize];
            if size > 0
                && GetUserPreferredUILanguages(
                    MUI_LANGUAGE_NAME,
                    &mut count,
                    buffer.as_mut_ptr(),
                    &mut size,
                ) != 0
            {
                return select(&String::from_utf16_lossy(&buffer));
            }
        }
        "en"
    })
}
#[cfg(test)]
mod tests {
    #[test]
    fn follows_preferred_languages_and_falls_back_to_english() {
        assert_eq!(super::select("fr-FR\0de-AT\0en-US\0"), "de");
        assert_eq!(super::select("en-GB\0de-DE\0"), "en");
        assert_eq!(super::select("ja-JP\0"), "en");
    }
}
